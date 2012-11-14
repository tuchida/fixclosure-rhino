'use struct';

function equalArray(a1, a2) {
  if (a1.length !== a2.length) {
    return false;
  }
  for (var i = 0, l = a1.length; i < l; i++) {
    if (a1[i] !== a2[i]) {
      return false;
    }
  }
  return true;
}

var fixclosure = require('../fixclosure.js');

var testFiles = new java.io.File('test/parse').listFiles(new java.io.FileFilter({
  accept: function(file) {
    return /.js$/.test(file.getName());
  }
}));

const parsedProperties = ['provided', 'required', 'toProvide', 'toRequire'];

testFiles.forEach(function(file) {
  print(file.getName() + ':');
  var expect = {};
  parsedProperties.forEach(function(p) {
    expect[p] = [];
  });
  var source = readFile(file.getCanonicalPath());
  source.replace(/(?:^|\n)\/\/ (provided|required|toProvide|toRequire): (.*)(?=\n|$)/g, function(_, p, s) {
    expect[p].push(s);
    return _;
  });
  var info = fixclosure.parse(source);

  parsedProperties.forEach(function(p) {
    if (!equalArray(expect[p], info[p])) {
      throw new Error('Test Failed\n' +
                      'Failed: ' + p + '\n' +
                      '  expect: ' + expect[p].join() + '\n' +
                      '  but: ' + info[p].join());
    }
  });
});
print('complite');
