var Token = org.mozilla.javascript.Token;

function registerIdentifier(node) {
  var current = node.getTarget();
  while (current) {
    switch (current.type) {
    case Token.GETPROP:
      if (current.getProperty().type == Token.NAME) {
        current = current.getTarget();
      } else {
        return null;
      }
      break;
    case Token.NAME:
      return String(node.toSource());
    default:
      return null;
    }
  }
}

/**
 * @param {string} name
 * @return {?string}
 */
function getPackageName(name) {
  var name = replaceMethod(name);
  var names = name.split('.');
  var lastname = names[names.length - 1];
  // Remove calling with apply or call.
  if ('apply' === lastname || 'call' == lastname) {
    names.pop();
    lastname = names[names.length - 1];
  }
  // Remove prototype or superClass_.
  names = names.reduceRight(function(prev, cur) {
    if (cur === 'prototype' || cur === 'superClass_') {
      return [];
    } else {
      prev.unshift(cur);
      return prev;
    }
  }, []);
  if (!isPackageMethod(name)) {
    lastname = names[names.length - 1];
    if (/^[a-z]/.test(lastname)) {
      // Remove the last method name.
      names.pop();
    } else if (/^[A-Z][_0-9A-Z]*$/.test(lastname)) {
      // Remove the last constant name.
      names.pop();
    }
  }

  if (names.length > 1) {
    return names.join('.');
  } else {
    // Ignore just one word namespace like 'goog'.
    return null;
  }
}

/**
 * @param {string} method Method name.
 * @return {string}
 */
function replaceMethod(method) {
  var replaceMap = {
    'goog.disposeAll': 'goog.dispose',
    //'goog.ui.KeyboardShortcutHandler.Modifiers': 'goog.ui.KeyboardShortcutHandler'
  };
  return replaceMap[method] || method;
}

/**
 * @param {string} method Method name.
 * @return {boolean}
 */
function isPackageMethod(method) {
  return method === 'goog.dispose' ||
    method === 'goog.ui.decorate';
}

function addPackageName(packages, node) {
  if (node && node.type == Token.GETPROP) {
    var use = registerIdentifier(node);
    if (use) {
      var p = getPackageName(use);
      if (p) {
        packages.add(p);
      }
    }
  }
}

function addWritedName(packages, node) {
  var args = node.getArguments();
  if (args.size() != 1) {
    throw new Error('invalid called ' + node.getTarget() + ': ' + node.toSource());
  }
  packages.add(args.get(0).getValue());
}

function parse(source) {
  var provided = java.util.TreeSet();
  var required = java.util.TreeSet();
  var toProvide = java.util.TreeSet();
  var toRequire = java.util.TreeSet();

  var ast = new org.mozilla.javascript.Parser().parse(source, '', 0);
  ast.visit(function(node) {
    switch (node.type) {
      //  Syntax.AssignmentExpression
    case Token.ASSIGN:
    case Token.ASSIGN_BITOR:
    case Token.ASSIGN_BITXOR:
    case Token.ASSIGN_BITAND:
    case Token.ASSIGN_LSH:
    case Token.ASSIGN_RSH:
    case Token.ASSIGN_URSH:
    case Token.ASSIGN_ADD:
    case Token.ASSIGN_SUB:
    case Token.ASSIGN_MUL:
    case Token.ASSIGN_DIV:
    case Token.ASSIGN_MOD:
      addPackageName(toProvide, node.getLeft());
      addPackageName(toRequire, node.getRight());
      break;

      // Syntax.ArrayExpression
    case Token.ARRAYLIT:
      for (var e in Iterator(node.getElements())) {
        addPackageName(toRequire, e);
      }
      break;

      // Syntax.CallExpression
      // Syntax.NewExpression
    case Token.CALL:
    case Token.NEW:
      addPackageName(toRequire, node.getTarget());
      for (var arg in Iterator(node.getArguments())) {
        addPackageName(toRequire, arg);
      }
      if (node.getTarget().type == Token.GETPROP) {
        if (node.getTarget().toSource() == 'goog.provide') {
          addWritedName(provided, node);
        } else if (node.getTarget().toSource() == 'goog.require') {
          addWritedName(required, node);
        }
      }

      break;

      // Syntax.ConditionalExpression
    case Token.HOOK:
      addPackageName(toRequire, node.getTestExpression());
      addPackageName(toRequire, node.getTrueExpression());
      addPackageName(toRequire, node.getFalseExpression());
      break;

    case Token.EXPR_RESULT:
      addPackageName(toProvide, node.getExpression());
      break;

      // Syntax.ExpressionStatement
      // Syntax.SwitchCase
      // Syntax.SwitchStatement
      // Syntax.ThrowStatement
    case Token.CASE:
    case Token.SWITCH:
    case Token.THROW:
      addPackageName(toRequire, node.getExpression());
      break;

      // Syntax.ForInStatement
      // Syntax.ForStatement
    case Token.FOR:
      if (node instanceof org.mozilla.javascript.ast.ForInLoop) {
        addPackageName(toRequire, node.getIterator());
        addPackageName(toRequire, node.getIteratedObject());
      } else {
        addPackageName(toRequire, node.getInitializer());
        addPackageName(toRequire, node.getCondition());
        addPackageName(toRequire, node.getIncrement());
      }
      break;

      // Syntax.DoWhileStatement
      // Syntax.IfStatement
      // Syntax.WhileStatement
    case Token.IF:
    case Token.WHILE:
    case Token.DO:
      addPackageName(toRequire, node.getCondition());
      break;

      // Syntax.LogicalExpression

      // Syntax.Property
    case Token.COLON:
      addPackageName(toRequire, node.getRight());
      break;

      // Syntax.ReturnStatement
    case Token.RETURN:
      addPackageName(toRequire, node.getReturnValue());
      break;

      // Syntax.BinaryExpression
      // Syntax.SequenceExpression
      // Syntax.MultiplicativeExpression
      // Syntax.AdditiveExpression
    case Token.ADD:
    case Token.AND:
    case Token.COMMA:
    case Token.DIV:
    case Token.GE:
    case Token.GT:
    case Token.IN:
    case Token.INSTANCEOF:
    case Token.LE:
    case Token.LT:
    case Token.MOD:
    case Token.MUL:
    case Token.OR:
    case Token.SUB:
      addPackageName(toRequire, node.getLeft());
      addPackageName(toRequire, node.getRight());
      break;

      // Syntax.UnaryExpression
      // Syntax.UpdateExpression
    case Token.BITNOT:
    case Token.DEC:
    case Token.DELPROP:
    case Token.INC:
    case Token.NEG:
    case Token.NOT:
    case Token.POS:
    case Token.TYPEOF:
    case Token.VOID:
      addPackageName(toRequire, node.getOperand());
      break;

      // Syntax.VariableDeclarator
    case Token.CONST:
    case Token.VAR:
      if (node instanceof org.mozilla.javascript.ast.VariableInitializer) {
        addPackageName(toRequire, node.getInitializer());
      }
      break;
    }
    return true;
  });

  return {
    provided: [String(e) for (e in Iterator(provided))],
    required: [String(e) for (e in Iterator(required))],
    toProvide: [String(e) for (e in Iterator(toProvide))],
    toRequire: [String(e) for (e in Iterator(toRequire)) if (!toProvide.contains(e)) ]
  };
}

exports.parse = parse;
