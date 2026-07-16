importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodide = null;

async function initPyodide() {
  pyodide = await self.loadPyodide();
}

// Inject expect framework vào Pyodide
async function injectExpectFramework() {
  await pyodide.runPythonAsync(`
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
`);
}

self.onmessage = async ({ data }) => {
  const { type, code, inputs, testCode } = data;

  if (type === 'run_manual') {
    try {
      if (!pyodide) await initPyodide();
      await pyodide.runPythonAsync(`
import sys
from io import StringIO
_mock_ins = ${JSON.stringify((inputs || '').split('\n'))}
_in_idx = 0
def input(prompt=""):
    global _in_idx
    val = _mock_ins[_in_idx] if _in_idx < len(_mock_ins) else ""
    _in_idx += 1
    return val
_out = StringIO()
sys.stdout = _out
      `);
      await pyodide.runPythonAsync(code);
      const output = await pyodide.runPythonAsync("_out.getvalue()");
      self.postMessage({ type: 'manual_result', output: output.trim(), error: null });
    } catch (e) {
      self.postMessage({ type: 'manual_result', output: '', error: e.message });
    }
    return;
  }

  if (type === 'run_suite') {
    try {
      if (!pyodide) await initPyodide();
      await injectExpectFramework();

      await pyodide.runPythonAsync("_results = []");
      await pyodide.runPythonAsync(testCode);

      // Tìm tất cả class kế thừa PythonTestSuite
      const suitesInfo = [];
      const namesJson = await pyodide.runPythonAsync(`
_json.dumps([name for name, cls in globals().items()
    if isinstance(cls, type) and name != "PythonTestSuite"
    and hasattr(cls, "__mro__") and PythonTestSuite in cls.__mro__])
      `);
      const names = JSON.parse(namesJson);

      for (const name of names) {
        const infoJson = await pyodide.runPythonAsync(`
_json.dumps({
    "name": "${name}",
    "inputs": ${name}.inputs if hasattr(${name}, "inputs") else [],
})
        `);
        suitesInfo.push(JSON.parse(infoJson));
      }

      for (const suite of suitesInfo) {
        await pyodide.runPythonAsync(`
import sys
from io import StringIO
_mock_ins = ${JSON.stringify(suite.inputs)}
_in_idx = 0
def input(prompt=""):
    global _in_idx
    val = _mock_ins[_in_idx] if _in_idx < len(_mock_ins) else ""
    _in_idx += 1
    return val
_out = StringIO()
sys.stdout = _out
        `);

        await pyodide.runPythonAsync(code);
        const stdout = await pyodide.runPythonAsync("_out.getvalue()");
        await pyodide.runPythonAsync(`student_output = ${JSON.stringify(stdout)}`);
        await pyodide.runPythonAsync(`${suite.name}().afterRun()`);
      }

      const resultsJson = await pyodide.runPythonAsync("_json.dumps(_results)");
      self.postMessage({ type: 'suite_result', results: JSON.parse(resultsJson) });

    } catch (e) {
      self.postMessage({ type: 'suite_result', error: e.message, results: [] });
    }
    return;
  }
};
