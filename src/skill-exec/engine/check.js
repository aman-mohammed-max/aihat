/* Checks one self-test result against what it expects. Plain JavaScript: shared by the app's test screen and the Node test. */
/* eslint-disable */
function check(test, r) {
  var e = test.expect || {};
  var problems = [];
  if (e.exitCode !== undefined && r.exitCode !== e.exitCode) problems.push('exit code ' + r.exitCode + ', expected ' + e.exitCode);
  if (e.exitCodeNot !== undefined && r.exitCode === e.exitCodeNot) problems.push('exit code should not be ' + e.exitCodeNot);
  if (e.stdout && r.stdout.indexOf(e.stdout) < 0) problems.push('output is missing "' + e.stdout + '"');
  if (e.stdoutNot && r.stdout.indexOf(e.stdoutNot) >= 0) problems.push('output should not contain "' + e.stdoutNot + '"');
  if (e.stderr && r.stderr.indexOf(e.stderr) < 0) problems.push('errors are missing "' + e.stderr + '"');
  (e.outputs || []).forEach(function (name) {
    var f = r.outputFiles && r.outputFiles[name];
    if (!f) problems.push('no ' + name + ' was made');
    else if (!f.length) problems.push(name + ' is empty');
  });
  return problems;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { check: check };
