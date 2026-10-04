// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const source = readFileSync("src-tauri/src/browser_automation.js", "utf8");
const run = (action: string, args: Record<string, unknown> = {}) => window.eval(`(${source})(${JSON.stringify(action)},${JSON.stringify(args)})`);
let hit: Element | null;

beforeEach(() => {
  document.body.innerHTML = '<label for="name">Name</label><input id="name"><input type="password" value="secret"><button>Submit</button><select><option value="a">Alpha</option><option value="b">Beta</option><option disabled value="c">Gamma</option></select>';
  Object.defineProperty(document.body, "innerText", { value: "Name Submit Alpha Beta Gamma", configurable: true });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({width:100,height:30,top:10,left:10,right:110,bottom:40,x:10,y:10,toJSON:()=>({})});
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = vi.fn(() => ({width:100,height:20,top:10,left:10,right:110,bottom:30,x:10,y:10,toJSON:()=>({})}));
  Object.defineProperty(document, "elementFromPoint", { value: () => hit, configurable:true });
});

function refFor(selector: string) {
  hit = document.querySelector(selector);
  const snapshot = run("browser_snapshot");
  const elements = Array.from(document.querySelectorAll('input,button,select'));
  return snapshot.elements[elements.indexOf(hit!)].ref;
}

describe("page browser runtime", () => {
  it("creates fresh references when HTTP pages lack crypto.randomUUID", () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID").mockImplementation(() => { throw new Error("Unavailable on HTTP"); });
    try {
      const first = run("browser_snapshot").elements[0].ref;
      const second = run("browser_snapshot").elements[0].ref;
      expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:1$/);
      expect(second).not.toBe(first);
      expect(randomUUID).not.toHaveBeenCalled();
    } finally { randomUUID.mockRestore(); }
  });
  it("returns observed element refs and labels without password values", () => {
    const snapshot = run("browser_snapshot");
    expect(snapshot.elements[0].label).toBe("Name");
    expect(snapshot.viewportText).toContain("Submit");
    expect(snapshot.elements[1].type).toBe("password");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(snapshot.elements[3].options[1]).toEqual({value:"b",label:"Beta",disabled:false});
  });
  it("fills through the native setter and emits form events without submitting", () => {
    const ref = refFor("#name");
    const input = hit as HTMLInputElement;
    const changed = vi.fn();
    input.addEventListener("input", changed);
    expect(run("browser_fill", {ref,text:'hello "世界"\n<script>'}).ok).toBe(true);
    expect(input.value).toBe('hello "世界"<script>');
    expect(changed).toHaveBeenCalledOnce();
    expect(run("browser_fill", {ref,text:"again"}).error).toContain("stale");
    expect(run("browser_snapshot").elements[0].value).toBe('hello "世界"<script>');
  });
  it("clicks once and refuses detached, changed, disabled or covered elements", () => {
    let ref = refFor("button");
    const click = vi.fn();
    hit!.addEventListener("click", click);
    expect(run("browser_click", {ref}).ok).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    ref = refFor("button");
    hit!.textContent = "Delete";
    expect(run("browser_click", {ref}).error).toContain("stale");
    ref = refFor("button");
    (hit as HTMLButtonElement).disabled = true;
    expect(run("browser_click", {ref}).error).toContain("disabled");
    ref = refFor("#name");
    hit = document.body;
    expect(run("browser_click", {ref}).error).toContain("covered");
    ref = refFor("#name");
    hit!.remove();
    expect(run("browser_fill", {ref,text:"oops"}).error).toContain("stale");
  });
  it("rejects references from previous snapshots", () => {
    const ref = refFor("button");
    run("browser_snapshot");
    expect(run("browser_click", {ref}).error).toContain("stale");
  });
  it("selects enabled options and rejects unsupported text fields", () => {
    let ref = refFor("select");
    expect(run("browser_select", {ref,value:"b"}).ok).toBe(true);
    expect((hit as HTMLSelectElement).value).toBe("b");
    ref = refFor("select");
    expect(run("browser_select", {ref,value:"c"}).error).toContain("disabled");
    ref = refFor("button");
    expect(run("browser_fill", {ref,text:"oops"}).error).toContain("not a supported");
  });
  it("does not interpolate executable code from action arguments", () => {
    const ref = refFor("#name");
    const text = '\");window.injection=true;//';
    expect(run("browser_fill", {ref,text}).ok).toBe(true);
    expect((hit as HTMLInputElement).value).toBe(text);
    expect((window as unknown as {injection?:boolean}).injection).toBeUndefined();
  });
});
