using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

// This companion is intentionally restricted to the separately launched D13 test app.
// No caller-selected process, window, selector, command, file or URL is accepted.
internal static class Companion
{
    private const int Version = 1;
    private const string TargetName = "morgoth-d13-test-target";
    private const string TargetHash = "__TARGET_SHA256__";
    private const int MaxRequest = 4096;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 8192 };

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetTokenInformation(IntPtr token, int infoClass, out int info, int length, out int used);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    private sealed class Target : IDisposable
    {
        internal Process Process;
        internal IntPtr Window;
        internal string Hash;
        internal long Started;
        internal Target(Process process, IntPtr window, string hash, long started)
        {
            Process = process; Window = window; Hash = hash; Started = started;
        }
        public void Dispose() { Process.Dispose(); }
    }

    [STAThread]
    private static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false, true);
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.Length != 0) return Reply("ARGUMENTS_REFUSED");
            string line = Console.In.ReadLine();
            if (line == null || Encoding.UTF8.GetByteCount(line) > MaxRequest) return Reply("REQUEST_INVALID");
            Dictionary<string, object> request = Json.Deserialize<Dictionary<string, object>>(line);
            if (request == null || !request.ContainsKey("v") || !(request["v"] is int) || (int)request["v"] != Version)
                return Reply("PROTOCOL_INVALID");
            string op = GetString(request, "op");
            if (op == "host_status")
            {
                RequireKeys(request, "v", "op");
                return Ok(op, new { version = Version, identity = "morgoth-d13-windows-companion", uia = true });
            }
            if (op == "discover_test_target")
            {
                RequireKeys(request, "v", "op");
                using (Target target = Discover())
                    return Ok(op, Identity(target));
            }
            if (op != "inspect_target" && op != "invoke_test_action") return Reply("OPERATION_REFUSED");
            if (op == "inspect_target") RequireKeys(request, "v", "op", "pid", "started", "hwnd", "exe_sha256");
            else RequireKeys(request, "v", "op", "pid", "started", "hwnd", "exe_sha256", "action");
            if (op == "invoke_test_action" && GetString(request, "action") != "toggle_test_state")
                return Reply("OPERATION_REFUSED");
            using (Target target = Discover())
            {
                MatchIdentity(request, target);
                if (op == "inspect_target") return Ok(op, Inspect(target));
                MatchIdentity(request, target);
                string before = ReadState(target);
                AutomationElement button = FindControl(target, "D13Toggle", ControlType.Button);
                object pattern;
                if (!button.TryGetCurrentPattern(InvokePattern.Pattern, out pattern)) return Reply("PATTERN_UNSUPPORTED");
                ((InvokePattern)pattern).Invoke();
                Thread.Sleep(100);
                MatchIdentity(request, target);
                string after = ReadState(target);
                if (before == after) return Reply("READBACK_UNCHANGED");
                return Ok(op, new { action = "toggle_test_state", before = before, after = after, verified = true });
            }
        }
        catch (InvalidOperationException e) { return Reply(e.Message); }
        catch { return Reply("HOST_OPERATION_FAILED"); }
    }

    private static string GetString(Dictionary<string, object> value, string key)
    {
        object item;
        if (!value.TryGetValue(key, out item) || !(item is string) || ((string)item).Length > 96)
            throw new InvalidOperationException("REQUEST_INVALID");
        return (string)item;
    }
    private static void RequireKeys(Dictionary<string, object> value, params string[] keys)
    {
        if (value.Count != keys.Length || keys.Any(key => !value.ContainsKey(key)))
            throw new InvalidOperationException("REQUEST_INVALID");
    }
    private static int Reply(string code)
    {
        // Only fixed, non-sensitive codes may cross the process boundary.
        string[] allowed = { "ARGUMENTS_REFUSED", "REQUEST_INVALID", "PROTOCOL_INVALID", "OPERATION_REFUSED",
            "TARGET_UNAVAILABLE", "TARGET_AMBIGUOUS", "TARGET_IDENTITY_MISMATCH", "TARGET_UNTRUSTED",
            "TARGET_ELEVATED", "TARGET_USER_MISMATCH", "TARGET_SESSION_MISMATCH", "WINDOW_INVALID",
            "UIA_UNAVAILABLE", "CONTROL_UNAVAILABLE", "PATTERN_UNSUPPORTED",
            "READBACK_UNCHANGED", "HOST_OPERATION_FAILED" };
        if (!allowed.Contains(code)) code = "HOST_OPERATION_FAILED";
        Console.WriteLine(Json.Serialize(new { v = Version, status = "ERROR", code = code }));
        return 2;
    }
    private static int Ok(string op, object data)
    {
        Console.WriteLine(Json.Serialize(new { v = Version, status = "OK", op = op, data = data }));
        return 0;
    }
    private static string Digest(string path)
    {
        using (var sha = SHA256.Create())
        using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }
    private static bool IsElevated(IntPtr token)
    {
        int value, used;
        if (!GetTokenInformation(token, 20, out value, 4, out used) || used != 4)
            throw new InvalidOperationException("TARGET_UNTRUSTED");
        return value != 0;
    }
    private static void CheckOwner(Process process)
    {
        IntPtr token;
        if (!OpenProcessToken(process.Handle, 0x0008, out token))
            throw new InvalidOperationException("TARGET_UNTRUSTED");
        try
        {
            using (var identity = new WindowsIdentity(token))
            {
                if (!identity.User.Equals(WindowsIdentity.GetCurrent().User))
                    throw new InvalidOperationException("TARGET_USER_MISMATCH");
            }
            if (IsElevated(token)) throw new InvalidOperationException("TARGET_ELEVATED");
        }
        finally { CloseHandle(token); }
    }
    private static Target Discover()
    {
        if (new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))
            throw new InvalidOperationException("TARGET_ELEVATED");
        string expectedPath = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, TargetName + ".exe"));
        if (!File.Exists(expectedPath) || Digest(expectedPath) != TargetHash)
            throw new InvalidOperationException("TARGET_UNTRUSTED");
        Process[] matches = Process.GetProcessesByName(TargetName);
        if (matches.Length == 0) throw new InvalidOperationException("TARGET_UNAVAILABLE");
        if (matches.Length != 1) { foreach (var item in matches) item.Dispose(); throw new InvalidOperationException("TARGET_AMBIGUOUS"); }
        Process process = matches[0];
        try
        {
            if (process.SessionId != Process.GetCurrentProcess().SessionId)
                throw new InvalidOperationException("TARGET_SESSION_MISMATCH");
            CheckOwner(process);
            string actualPath = Path.GetFullPath(process.MainModule.FileName);
            if (!String.Equals(actualPath, expectedPath, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("TARGET_UNTRUSTED");
            IntPtr hwnd = process.MainWindowHandle;
            uint windowPid;
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd) || !IsWindowVisible(hwnd) ||
                GetWindowThreadProcessId(hwnd, out windowPid) == 0 || windowPid != (uint)process.Id)
                throw new InvalidOperationException("WINDOW_INVALID");
            return new Target(process, hwnd, TargetHash, process.StartTime.ToUniversalTime().Ticks);
        }
        catch { process.Dispose(); throw; }
    }
    private static object Identity(Target target)
    {
        return new { app = "Morgoth D13 Test Target", pid = target.Process.Id.ToString(),
            started = target.Started.ToString(), hwnd = target.Window.ToInt64().ToString(),
            exe_sha256 = target.Hash, operation = "toggle_test_state", session = target.Process.SessionId.ToString() };
    }
    private static void MatchIdentity(Dictionary<string, object> request, Target target)
    {
        if (GetString(request, "pid") != target.Process.Id.ToString() ||
            GetString(request, "started") != target.Started.ToString() ||
            GetString(request, "hwnd") != target.Window.ToInt64().ToString() ||
            GetString(request, "exe_sha256") != target.Hash)
            throw new InvalidOperationException("TARGET_IDENTITY_MISMATCH");
        uint windowPid;
        if (!IsWindow(target.Window) || GetWindowThreadProcessId(target.Window, out windowPid) == 0 ||
            windowPid != (uint)target.Process.Id) throw new InvalidOperationException("WINDOW_INVALID");
    }
    private static AutomationElement FindControl(Target target, string id, ControlType type)
    {
        AutomationElement window = AutomationElement.FromHandle(target.Window);
        if (window == null || window.Current.ProcessId != target.Process.Id)
            throw new InvalidOperationException("UIA_UNAVAILABLE");
        AutomationElementCollection all = window.FindAll(TreeScope.Descendants, Condition.TrueCondition);
        if (all.Count > 32) throw new InvalidOperationException("UIA_UNAVAILABLE");
        AutomationElement found = null;
        foreach (AutomationElement element in all)
        {
            if (element.Current.AutomationId == id && element.Current.ControlType == type && !element.Current.IsPassword)
            {
                if (found != null) throw new InvalidOperationException("CONTROL_UNAVAILABLE");
                found = element;
            }
        }
        if (found == null) throw new InvalidOperationException("CONTROL_UNAVAILABLE");
        return found;
    }
    private static string ReadState(Target target)
    {
        AutomationElement label = FindControl(target, "D13State", ControlType.Text);
        string name = label.Current.Name;
        if (name == "État : actif") return "ACTIVE";
        if (name == "État : inactif") return "INACTIVE";
        throw new InvalidOperationException("CONTROL_UNAVAILABLE");
    }
    private static object Inspect(Target target)
    {
        AutomationElement label = FindControl(target, "D13State", ControlType.Text);
        AutomationElement button = FindControl(target, "D13Toggle", ControlType.Button);
        object pattern;
        bool invokable = button.Current.IsEnabled && button.TryGetCurrentPattern(InvokePattern.Pattern, out pattern);
        return new { state = ReadState(target), controls = new object[] {
            new { automation_id = "D13State", control_type = "Text", name = label.Current.Name,
                enabled = label.Current.IsEnabled, invoke = false, password = false },
            new { automation_id = "D13Toggle", control_type = "Button", name = button.Current.Name,
                enabled = button.Current.IsEnabled, invoke = invokable, password = false }
        } };
    }
}
