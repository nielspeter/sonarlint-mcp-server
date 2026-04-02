# Configurable SonarLint Rules

**84 configurable rules** across 4 languages.

> Auto-generated from SLOOP backend. Regenerate with `npm run docs:rules`.
>
> Configure these rules in your project's `sonarlint.json`:
>
> ```json
> {
>   "rules": {
>     "javascript:S3776": {
>       "level": "on",
>       "parameters": { "threshold": "20" }
>     }
>   }
> }
> ```

## CSS (7 rules)

| Rule | Name | Parameter | Default | Type |
|------|------|-----------|---------|------|
| `css:S4649` | Font declarations should contain at least one generic font family | `ignoreFontFamilies` | — | STRING |
| `css:S4654` | CSS properties should be valid | `ignoreSelectors` | `/^:export.*/, /^:import.*/` | STRING |
|  |  | `ignoreTypes` | `composes, /^mso-/` | STRING |
| `css:S4656` | Properties should not be duplicated | `ignoreFallbacks` | `true` | BOOLEAN |
| `css:S4659` | Pseudo-class selectors should be valid | `ignorePseudoClasses` | `local,global,export,import,deep` | STRING |
| `css:S4660` | Pseudo-element selectors should be valid | `ignorePseudoElements` | `ng-deep,v-deep,deep` | STRING |
| `css:S4662` | "at-rules" should be valid | `ignoreAtRules` | `value,at-root,content,debug,each,else,error,for,function,if,include,mixin,return,warn,while,extend,use,forward,tailwind,apply,layer,container,theme,/^@.*/` | STRING |
| `css:S4670` | Selectors should be known | `ignore` | `custom-elements` | STRING |
|  |  | `ignoreTypes` | `/^(mat|md|fa)-/` | STRING |

## JS (24 rules)

| Rule | Name | Parameter | Default | Type |
|------|------|-----------|---------|------|
| `javascript:S100` | Function and method names should comply with a naming convention | `format` | `^[_a-z][a-zA-Z0-9]*$` | STRING |
| `javascript:S101` | Class names should comply with a naming convention | `format` | `^[A-Z][a-zA-Z0-9]*$` | STRING |
| `javascript:S103` | Lines should not be too long | `maximumLineLength` | `180` | INTEGER |
| `javascript:S104` | Files should not have too many lines of code | `maximum` | `1000` | INTEGER |
| `javascript:S1067` | Expressions should not be too complex | `max` | `3` | INTEGER |
| `javascript:S107` | Functions should not have too many parameters | `maximumFunctionParameters` | `7` | INTEGER |
| `javascript:S1105` | An open curly brace should be located at the end of a line | `braceStyle` | `1tbs` | STRING |
| `javascript:S117` | Variable, property and parameter names should comply with a naming convention | `format` | `^[_$A-Za-z][$A-Za-z0-9]*$|^[_$A-Z][_$A-Z0-9]+$` | STRING |
| `javascript:S1192` | String literals should not be duplicated | `ignoreStrings` | `application/json` | STRING |
|  |  | `threshold` | `3` | INTEGER |
| `javascript:S134` | Control flow statements "if", "for", "while", "switch" and "try" should not be nested too deeply | `maximumNestingLevel` | `3` | INTEGER |
| `javascript:S138` | Functions should not have too many lines of code | `max` | `200` | INTEGER |
| `javascript:S139` | Comments should not be located at the end of lines of code | `pattern` | `^\s*[^\s]+$` | STRING |
| `javascript:S1441` | Quotes for string literals should be used consistently | `singleQuotes` | `true` | BOOLEAN |
| `javascript:S1451` | Track lack of copyright and license headers | `headerFormat` | — | TEXT |
|  |  | `isRegularExpression` | `false` | BOOLEAN |
| `javascript:S1479` | "switch" statements should not have too many "case" clauses | `maximum` | `30` | INTEGER |
| `javascript:S1541` | Cyclomatic Complexity of functions should not be too high | `maximumFunctionComplexityThreshold` | `10` | INTEGER |
| `javascript:S2004` | Functions should not be nested too deeply | `max` | `4` | INTEGER |
| `javascript:S2376` | Property getters and setters should come in pairs | `getWithoutSet` | `false` | BOOLEAN |
| `javascript:S2999` | "new" should only be used with functions and classes | `considerJSDoc` | `false` | BOOLEAN |
| `javascript:S3524` | Braces and parentheses should be used consistently with arrow functions | `body_braces` | `false` | BOOLEAN |
|  |  | `parameter_parens` | `false` | BOOLEAN |
| `javascript:S3776` | Cognitive Complexity of functions should not be too high | `threshold` | `15` | INTEGER |
| `javascript:S4275` | Getters and setters should access the expected fields | `allowImplicit` | `false` | BOOLEAN |
| `javascript:S5843` | Regular expressions should not be too complicated | `threshold` | `20` | INTEGER |
| `javascript:S6747` | JSX elements should not use unknown properties and attributes | `whitelist` | — | STRING |

## PYTHON (27 rules)

| Rule | Name | Parameter | Default | Type |
|------|------|-----------|---------|------|
| `python:ClassComplexity` | Cyclomatic Complexity of classes should not be too high | `maximumClassComplexityThreshold` | `200` | INTEGER |
| `python:FileComplexity` | Files should not be too complex | `maximumFileComplexityThreshold` | `200` | INTEGER |
| `python:FunctionComplexity` | Cyclomatic Complexity of functions should not be too high | `maximumFunctionComplexityThreshold` | `15` | INTEGER |
| `python:LineLength` | Lines should not be too long | `maximumLineLength` | `120` | INTEGER |
| `python:S100` | Method names should comply with a naming convention | `format` | `^[a-z_][a-z0-9_]*$` | STRING |
| `python:S101` | Class names should comply with a naming convention | `format` | `^_?([A-Z_][a-zA-Z0-9]*|[a-z_][a-z0-9_]*)$` | STRING |
| `python:S104` | Files should not have too many lines of code | `maximum` | `1000` | INTEGER |
| `python:S107` | Functions, methods and lambdas should not have too many parameters | `max` | `13` | INTEGER |
| `python:S1142` | Functions should not contain too many return statements | `max` | `3` | INTEGER |
| `python:S116` | Field names should comply with a naming convention | `format` | `^[_a-z][_a-z0-9]*$` | STRING |
| `python:S117` | Local variable and function parameter names should comply with a naming convention | `format` | `^[_a-z][a-z0-9_]*$` | STRING |
| `python:S1192` | String literals should not be duplicated | `exclusionRegex` | — | STRING |
|  |  | `threshold` | `3` | INTEGER |
| `python:S125` | Sections of code should not be commented out | `exception` | `(fmt|py\w+):.*` | STRING |
| `python:S134` | Control flow statements "if", "for", "while", "try" and "with" should not be nested too deeply | `max` | `4` | INTEGER |
| `python:S138` | Functions should not have too many lines of code | `max` | `100` | INTEGER |
| `python:S139` | Comments should not be located at the end of lines of code | `legalTrailingCommentPattern` | `^#\s*+([^\s]++|fmt.*|type.*|noqa.*)$` | STRING |
| `python:S1451` | Track lack of copyright and license headers | `headerFormat` | — | TEXT |
|  |  | `isRegularExpression` | `false` | BOOLEAN |
| `python:S1481` | Unused local variables should be removed | `regex` | `(_[a-zA-Z0-9_]*|dummy|unused|ignored)` | STRING |
| `python:S1542` | Function names should comply with a naming convention | `format` | `^[a-z_][a-z0-9_]*$` | STRING |
| `python:S1578` | Module names should comply with a naming convention | `format` | `(([a-z_][a-z0-9_]*)|([A-Z][a-zA-Z0-9]+))$` | STRING |
| `python:S1707` | Track "TODO" and "FIXME" comments that do not contain a reference to a person | `pattern` | `[ ]*\([ _a-zA-Z0-9@.]+\)` | STRING |
| `python:S2710` | The first argument to class methods should follow the naming convention | `classParameterNames` | `cls,mcs,metacls` | STRING |
| `python:S3776` | Cognitive Complexity of functions should not be too high | `threshold` | `15` | INTEGER |
| `python:S4487` | Unread "private" attributes should be removed | `enableSingleUnderscoreIssues` | `false` | BOOLEAN |
| `python:S5720` | "self" should be the first argument to instance methods | `ignoredDecorators` | `abstractmethod` | STRING |
| `python:S5843` | Regular expressions should not be too complicated | `maxComplexity` | `20` | INTEGER |
| `python:S905` | Non-empty statements should change control flow or have at least one side-effect | `reportOnStrings` | `false` | BOOLEAN |
|  |  | `ignoredOperators` | `<<,>>,|` | STRING |

## TS (26 rules)

| Rule | Name | Parameter | Default | Type |
|------|------|-----------|---------|------|
| `typescript:S100` | Function and method names should comply with a naming convention | `format` | `^[_a-z][a-zA-Z0-9]*$` | STRING |
| `typescript:S101` | Class names should comply with a naming convention | `format` | `^[A-Z][a-zA-Z0-9]*$` | STRING |
| `typescript:S103` | Lines should not be too long | `maximumLineLength` | `180` | INTEGER |
| `typescript:S104` | Files should not have too many lines of code | `maximum` | `1000` | INTEGER |
| `typescript:S1067` | Expressions should not be too complex | `max` | `3` | INTEGER |
| `typescript:S107` | Functions should not have too many parameters | `maximumFunctionParameters` | `7` | INTEGER |
| `typescript:S1105` | An open curly brace should be located at the end of a line | `braceStyle` | `1tbs` | STRING |
| `typescript:S117` | Variable, property and parameter names should comply with a naming convention | `format` | `^[_$A-Za-z][$A-Za-z0-9]*$|^[_$A-Z][_$A-Z0-9]+$` | STRING |
| `typescript:S1192` | String literals should not be duplicated | `ignoreStrings` | `application/json` | STRING |
|  |  | `threshold` | `3` | INTEGER |
| `typescript:S134` | Control flow statements "if", "for", "while", "switch" and "try" should not be nested too deeply | `maximumNestingLevel` | `3` | INTEGER |
| `typescript:S138` | Functions should not have too many lines of code | `max` | `200` | INTEGER |
| `typescript:S139` | Comments should not be located at the end of lines of code | `pattern` | `^\s*[^\s]+$` | STRING |
| `typescript:S1441` | Quotes for string literals should be used consistently | `singleQuotes` | `true` | BOOLEAN |
| `typescript:S1451` | Track lack of copyright and license headers | `headerFormat` | — | TEXT |
|  |  | `isRegularExpression` | `false` | BOOLEAN |
| `typescript:S1479` | "switch" statements should not have too many "case" clauses | `maximum` | `30` | INTEGER |
| `typescript:S1541` | Cyclomatic Complexity of functions should not be too high | `Threshold` | `10` | INTEGER |
| `typescript:S2004` | Functions should not be nested too deeply | `max` | `4` | INTEGER |
| `typescript:S2376` | Property getters and setters should come in pairs | `getWithoutSet` | `false` | BOOLEAN |
| `typescript:S2999` | "new" should only be used with functions and classes | `considerJSDoc` | `false` | BOOLEAN |
| `typescript:S3524` | Braces and parentheses should be used consistently with arrow functions | `body_braces` | `false` | BOOLEAN |
|  |  | `parameter_parens` | `false` | BOOLEAN |
| `typescript:S3776` | Cognitive Complexity of functions should not be too high | `threshold` | `15` | INTEGER |
| `typescript:S4275` | Getters and setters should access the expected fields | `allowImplicit` | `false` | BOOLEAN |
| `typescript:S4328` | Dependencies should be explicit | `whitelist` | — | STRING |
| `typescript:S4622` | Union types should not have too many elements | `threshold` | `3` | INTEGER |
| `typescript:S5843` | Regular expressions should not be too complicated | `threshold` | `20` | INTEGER |
| `typescript:S6747` | JSX elements should not use unknown properties and attributes | `whitelist` | — | STRING |

