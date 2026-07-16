(function(){"use strict";importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");let t=null;async function i(){t=await self.loadPyodide()}async function r(){await t.runPythonAsync(`
import json as _json

class expect:
    def __init__(self, actual):
        self.actual = actual
        self._test_name = ""
        self._points = 1

    def to_contain(self, expected):
        _results.append({
            "test_name": self._test_name or f"Chua {expected}",
            "passed": str(expected) in str(self.actual),
            "actual": str(self.actual)[:200],
            "expected": str(expected),
            "points": self._points,
        })
        return self

    def to_equal(self, expected):
        _results.append({
            "test_name": self._test_name or f"Bang {expected}",
            "passed": str(self.actual).strip() == str(expected).strip(),
            "actual": str(self.actual)[:200],
            "expected": str(expected),
            "points": self._points,
        })
        return self

    def with_options(self, **kw):
        self._test_name = kw.get("test_name", self._test_name)
        self._points = kw.get("points", self._points)
        return self

class PythonTestSuite:
    inputs = []
    points = 1
    def afterRun(self):
        pass
`)}self.onmessage=async({data:u})=>{const{type:a,code:o,inputs:l,testCode:_}=u;if(a==="run_manual"){try{t||await i(),await t.runPythonAsync(`
import sys
from io import StringIO
_mock_ins = ${JSON.stringify((l||"").split(`
`))}
_in_idx = 0
def input(prompt=""):
    global _in_idx
    val = _mock_ins[_in_idx] if _in_idx < len(_mock_ins) else ""
    _in_idx += 1
    return val
_out = StringIO()
sys.stdout = _out
      `),await t.runPythonAsync(o);const s=await t.runPythonAsync("_out.getvalue()");self.postMessage({type:"manual_result",output:s.trim(),error:null})}catch(s){self.postMessage({type:"manual_result",output:"",error:s.message})}return}if(a==="run_suite"){try{t||await i(),await r(),await t.runPythonAsync("_results = []"),await t.runPythonAsync(_);const s=[],p=await t.runPythonAsync(`
_json.dumps([name for name, cls in globals().items()
    if isinstance(cls, type) and name != "PythonTestSuite"
    and hasattr(cls, "__mro__") and PythonTestSuite in cls.__mro__])
      `),c=JSON.parse(p);for(const e of c){const n=await t.runPythonAsync(`
_json.dumps({
    "name": "${e}",
    "inputs": ${e}.inputs if hasattr(${e}, "inputs") else [],
})
        `);s.push(JSON.parse(n))}for(const e of s){await t.runPythonAsync(`
import sys
from io import StringIO
_mock_ins = ${JSON.stringify(e.inputs)}
_in_idx = 0
def input(prompt=""):
    global _in_idx
    val = _mock_ins[_in_idx] if _in_idx < len(_mock_ins) else ""
    _in_idx += 1
    return val
_out = StringIO()
sys.stdout = _out
        `),await t.runPythonAsync(o);const n=await t.runPythonAsync("_out.getvalue()");await t.runPythonAsync(`student_output = ${JSON.stringify(n)}`),await t.runPythonAsync(`${e.name}().afterRun()`)}const f=await t.runPythonAsync("_json.dumps(_results)");self.postMessage({type:"suite_result",results:JSON.parse(f)})}catch(s){self.postMessage({type:"suite_result",error:s.message,results:[]})}return}}})();
