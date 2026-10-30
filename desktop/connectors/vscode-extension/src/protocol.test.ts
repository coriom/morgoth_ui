import { test } from "node:test";
import { strict as assert } from "node:assert";
import { MAX_BRIEF, MAX_LINE, parseRequest, safeLabel } from "./protocol";

test("fixed versioned requests reject arbitrary commands and oversized input", () => {
  const code = "a".repeat(32);
  assert.equal(parseRequest(JSON.stringify({v:1,id:1,op:"pair",code}))?.op,"pair");
  assert.equal(parseRequest(JSON.stringify({v:1,id:2,op:"executeCommand",session:code})),null);
  assert.equal(parseRequest(JSON.stringify({v:1,id:2,op:"scratch",session:code,path:"/etc/passwd"})),null);
  assert.equal(parseRequest(`{"v":1,"id":2,"op":"metadata","session":"${code}","op":"scratch"}`),null);
  assert.equal(parseRequest("x".repeat(MAX_LINE+1)),null);
  assert.equal(safeLabel("a\nsecret"),"a secret");
  const digest = "b".repeat(64);
  assert.equal(parseRequest(JSON.stringify({v:1,id:3,op:"brief_scratch",session:code,content:"# Synthetic",digest}))?.op,"brief_scratch");
  assert.equal(parseRequest(JSON.stringify({v:1,id:3,op:"brief_scratch",session:code,content:"x".repeat(MAX_BRIEF+1),digest})),null);
  assert.equal(parseRequest(JSON.stringify({v:1,id:3,op:"scratch",session:code,content:"# synthetic",digest})),null);
  assert.equal(parseRequest(JSON.stringify({v:1,id:3,op:"brief_scratch",session:code,content:"# synthetic",digest,path:"/tmp/a"})),null);
});
