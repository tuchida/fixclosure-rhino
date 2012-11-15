var Token = org.mozilla.javascript.Token;

function registerIdentifier(node, scope) {
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
      if (current.getIdentifier() in scope) {
        return null;
      }
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

function addPackageName(packages, node, scope) {
  if (node && node.type == Token.GETPROP) {
    var use = registerIdentifier(node, scope);
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

/**
 * @constructor
 */
function Parsed() {
  this.provided = java.util.TreeSet();
  this.required = java.util.TreeSet();
  this.toProvide = java.util.TreeSet();
  this.toRequire = java.util.TreeSet();
}

Parsed.prototype.toResult = function() {
  return {
    provided: [String(e) for (e in Iterator(this.provided))],
    required: [String(e) for (e in Iterator(this.required))],
    toProvide: [String(e) for (e in Iterator(this.toProvide))],
    toRequire: [String(e) for (e in Iterator(this.toRequire)) if (!this.toProvide.contains(e)) ]
  };
};

function pushScope(parent) {
  var scope = {};
  scope.__proto__ = parent;
  return scope;
}

function buildVisitor(rootNode, scope, parsed) {
  return function(node) {
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
      addPackageName(parsed.toProvide, node.getLeft(), scope);
      addPackageName(parsed.toRequire, node.getRight(), scope);
      break;

      // Syntax.ArrayExpression
    case Token.ARRAYLIT:
      for (var e in Iterator(node.getElements())) {
        addPackageName(parsed.toRequire, e, scope);
      }
      break;

      // Syntax.CallExpression
      // Syntax.NewExpression
    case Token.CALL:
    case Token.NEW:
      addPackageName(parsed.toRequire, node.getTarget(), scope);
      for (var arg in Iterator(node.getArguments())) {
        addPackageName(parsed.toRequire, arg, scope);
      }
      if (node.getTarget().type == Token.GETPROP) {
        if (node.getTarget().toSource() == 'goog.provide') {
          addWritedName(parsed.provided, node);
        } else if (node.getTarget().toSource() == 'goog.require') {
          addWritedName(parsed.required, node);
        }
      }

      break;

      // Syntax.ConditionalExpression
    case Token.HOOK:
      addPackageName(parsed.toRequire, node.getTestExpression(), scope);
      addPackageName(parsed.toRequire, node.getTrueExpression(), scope);
      addPackageName(parsed.toRequire, node.getFalseExpression(), scope);
      break;

    case Token.EXPR_RESULT:
      addPackageName(parsed.toProvide, node.getExpression(), scope);
      break;

      // Syntax.ExpressionStatement
      // Syntax.SwitchCase
      // Syntax.SwitchStatement
      // Syntax.ThrowStatement
    case Token.CASE:
    case Token.SWITCH:
    case Token.THROW:
      addPackageName(parsed.toRequire, node.getExpression(), scope);
      break;

      // Syntax.ForInStatement
      // Syntax.ForStatement
    case Token.FOR:
      if (node instanceof org.mozilla.javascript.ast.ForInLoop) {
        addPackageName(parsed.toRequire, node.getIterator(), scope);
        addPackageName(parsed.toRequire, node.getIteratedObject(), scope);
      } else {
        addPackageName(parsed.toRequire, node.getInitializer(), scope);
        addPackageName(parsed.toRequire, node.getCondition(), scope);
        addPackageName(parsed.toRequire, node.getIncrement(), scope);
      }
      break;

      // Syntax.DoWhileStatement
      // Syntax.IfStatement
      // Syntax.WhileStatement
    case Token.IF:
    case Token.WHILE:
    case Token.DO:
      addPackageName(parsed.toRequire, node.getCondition(), scope);
      break;

      // Syntax.LogicalExpression

      // Syntax.Property
    case Token.COLON:
      addPackageName(parsed.toRequire, node.getRight(), scope);
      break;

      // Syntax.ReturnStatement
    case Token.RETURN:
      addPackageName(parsed.toRequire, node.getReturnValue(), scope);
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
      addPackageName(parsed.toRequire, node.getLeft(), scope);
      addPackageName(parsed.toRequire, node.getRight(), scope);
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
      addPackageName(parsed.toRequire, node.getOperand(), scope);
      break;

      // Syntax.VariableDeclarator
    case Token.CONST:
    case Token.VAR:
      if (node instanceof org.mozilla.javascript.ast.VariableInitializer) {
        addPackageName(parsed.toRequire, node.getInitializer(), scope);
        scope[node.getTarget().getIdentifier()] = 1;
      }
      break;

    case Token.FUNCTION:
      if (rootNode !== node) {
        var newScope = pushScope(scope);
        for (var p in Iterator(node.getParams())) {
          newScope[p.getIdentifier()] = 1;
        }
        node.visit(buildVisitor(node, newScope, parsed));
        return false;
      }
      break;

    case Token.CATCH:
      if (rootNode !== node) {
        var newScope = pushScope(scope);
        newScope[node.getVarName().getIdentifier()] = 1;
        node.visit(buildVisitor(node, newScope, parsed));
        return false;
      }
      break;

    }
    return true;
  };
}

function parse(source) {
  var parsed = new Parsed();
  var scope = {};
  var root = null;
  var ast = new org.mozilla.javascript.Parser().parse(source, '', 0);
  ast.visit(buildVisitor(ast, {}, parsed));
  return parsed.toResult();
}

exports.parse = parse;
