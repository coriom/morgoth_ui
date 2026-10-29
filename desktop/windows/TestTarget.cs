using System;
using System.Drawing;
using System.Windows.Forms;

// Disposable, user-launched Windows UI Automation target. No file or network access.
internal static class TestTarget
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        var form = new Form {
            Text = "Morgoth D13 — fenêtre de test",
            Name = "MorgothD13TestWindow",
            Width = 420,
            Height = 220,
            StartPosition = FormStartPosition.CenterScreen,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false
        };
        var title = new Label {
            Text = "Application de test Morgoth",
            Name = "D13Title",
            AccessibleName = "Application de test Morgoth",
            Location = new Point(24, 22), Width = 340, Height = 26
        };
        var state = new Label {
            Text = "État : inactif",
            Name = "D13State",
            AccessibleName = "État : inactif",
            Location = new Point(24, 64), Width = 340, Height = 30
        };
        var toggle = new Button {
            Text = "Basculer le test",
            Name = "D13Toggle",
            AccessibleName = "Basculer le test",
            Location = new Point(24, 108), Width = 190, Height = 34
        };
        bool active = false;
        toggle.Click += (sender, args) => {
            active = !active;
            state.Text = active ? "État : actif" : "État : inactif";
            state.AccessibleName = state.Text;
        };
        form.Controls.Add(title);
        form.Controls.Add(state);
        form.Controls.Add(toggle);
        Application.Run(form);
    }
}
