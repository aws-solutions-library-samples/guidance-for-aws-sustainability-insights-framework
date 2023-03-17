# Expressions

Formulas are case-insensitive.

Some formulas have optional parameters. These are referenced as `name=?`, e.g. `version=2` and `timezone='America/Denver'`.

Extra whitespace is ignored.

Any number of expressions may be chained as long as the overall formula is syntactically correct.

## Basic arithmetic

| Operator | Use           | Description                                      |
|----------|---------------|--------------------------------------------------|
| `+`      | `1 + 2`       | Adds two operators                               |
| `-`      | `1 - 2`       | Subtracts an operator from another               |
| `-`      | `-1`          | Negates an operator                              |
| `*`      | `1 * 2`       | Multiplies two operators                         |
| `/`      | `1 / 2`       | Divides an operator by another                   |
| `^`      | `10 ^ 2`      | Exponential (power)                              |
| `( )`    | `6 * (4 + 2)` | Parenthesis allow specifying order of operations |

## Comparison operations

| Operator | Use      | Description           |
|----------|----------|-----------------------|
| `>`      | `1 > 2`  | Greater than          |
| `>=`     | `1 >= 2` | Greater or equal than |
| `<`      | `1 < 2`  | Less than             |
| `<=`     | `1 <= 2` | Less or equal than    |
| `==`     | `1 == 2` | Equal to              |
| `!=`     | `1 != 2` | Not equal to          |

## String functions

### `AS_TIMESTAMP` function

Converts a given input into a UTC timestamp.

```
AS_TIMESTAMP( value, pattern, timezone=?, locale=?, roundDownTo=? )
```

Where:

- `value` (required) is the string to be evaluated.
- `pattern` (required) is the date / time pattern of the provided `value` to convert from (see _Supported date / time patterns_ table below).
- if `roundDownTo=?` (optional - string) is specified, timestamp will be round down to beginning of `day/week/month/quarter/year` depending on the specified input. This is used when you want to aggregate your pipeline output by a period of time. Supported values are `day`, `week`, `month`, `quarter` and `year`.
- if `timezone=?` (optional - string) is specified, the provided timezone (e.g. `America/Denver`) is used to convert the `value` to a UTC timestamp. Recommended if the provided `value` does not contain a timezone. If the `value` does not contain a timezone, and `timezone` is not provided, then the system default is used.
- if `locale=?` (optional - string) is specified, the provided locale will be used to convert the `value` using the `pattern` using the `locale` specified. The `locale` can be represented as a [ISO language code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes), or a [ISO language code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes) and [ISO Country Code](https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes), e.g. `fr` for French, or `fr-CA` for French Canadian.

Supported date / time patterns:

| Letter | Date or Time Component                           | Examples                              |
|--------|--------------------------------------------------|---------------------------------------|
| G      | Era designator                                   | AD                                    |
| y      | Year                                             | 1996; 96                              |
| Y      | Week year                                        | 2009; 09                              |
| M      | Month in year (context sensitive)                | July; Jul; 07                         |
| L      | Month in year (standalone form)                  | July; Jul; 07                         |
| w      | Week in year                                     | 27                                    |
| W      | Week in month                                    | 2                                     |
| D      | Day in year                                      | 189                                   |
| d      | Day in month                                     | 10                                    |
| F      | Day of week in month                             | 2                                     |
| E      | Day name in week                                 | Tuesday; Tue                          |
| u      | Day number of week (1 = Monday, ..., 7 = Sunday) | 1                                     |
| a      | Am/pm marker                                     | PM                                    |
| H      | Hour in day (0-23)                               | 0                                     |
| k      | Hour in day (1-24)                               | 24                                    |
| K      | Hour in am/pm (0-11)                             | 0                                     |
| h      | Hour in am/pm (1-12)                             | 12                                    |
| m      | Minute in hour                                   | 30                                    |
| s      | Second in minute                                 | 55                                    |
| S      | Millisecond                                      | 978                                   |
| z      | General time zone                                | Pacific Standard Time; PST; GMT-08:00 |
| Z      | RFC 822 time zone                                | -0800                                 |
| X      | ISO 8601 time zone                               | -08; -0800; -08:00                    |

### `CONCAT` function

Concatenates multiple values into a single string.

```
CONCAT( expression_1, expression_2, expression_3, ... )
```

Where:

- `expression_1` (required) is the first expression to be evaluated to return a string.
- `expression_2` (required) will be evaluated if `expression_1` returns no value.
- the pattern is repeated with (optional) `expression_3` and beyond.

### `LOWERCASE` function

Converts a provided string to lowercase.

```
LOWERCASE( expression )
```

Where:

- `expression` (required) an expression that should evaluate to a string. The result of this expression is converted to lower case characters.

### `UPPERCASE` function

Converts a provided string to uppercase.

```
UPPERCASE( expression )
```

Where:

- `expression` (required) an expression that should evaluate to a string. The result of this expression is converted to upper case characters.


## Logical functions

### `COALESCE` function

Returns the first non-null value from a series of expressions.

```
COALESCE( expression_1, expression_2, expression_3, ... )
```

Where:

- `expression_1` (required) is the first expression to be evaluated.
- `expression_2` (required) will be evaluated if `expression_1` returns no value.
- the pattern is repeated with (optional) `expression_3` and beyond.

### `IF` function

Given an expression to evaluate (`logical_test_expression`), one of two expressions will be validated based on its result.

```
IF ( logical_test_expression , when_true_expression , when_false_expression )
```

Where:

- `logical_test_expression` (required) is an expression that should evaluate to true or false, or the result of a comparison operator.
- `when_true_expression` (required) will be executed if `logical_test_expression` is true.
- `when_false_expression` (required) will be executed if `logical_test_expression` is false.

### `SWITCH` function

Given a value (`value_expression`), each following case (`case_expression_*`) will be checked for equalness. If equal, the cases corresponding paired result (`result_expression_*`) will be returned.

```
SWITCH ( value_expression , case_expression_1 , result_expression_1, case_expression_2, result_expression_2, ..., default=?, ignoreCase=? )
```

Where:

- `value_expression` (required) is an expression once evaluated will provide the value that is to be matched against.
- `case_expression_1` (required) a value to match against `value_expression`.
- `result_expression_1` (required) if `value_expression` equals `case_expression_1` then the result of `result_expression_1` is returned.
- pairs of `case_expression_?` and `result_expression_?` are repeated for each additional to be matched along with its corresponding result.
- if `default=?` (optional - string) is specified, and no matches are found with the provided `case_expression_?` values, then the value of `default=?` is returned.
- if `ignoreCase=?` (optional - boolean) is specified, either a case-sensitive (`false`) or case-insensitive (`true`) match will be performed. If not provided, then case sensitive matching is performed.

## Sustainability related functions

### `IMPACT` function

Returns a specific emission impact factor.

```
IMPACT( 'activity', 'impact', 'component', version=?, group=?, tenant=? )
```

Where:

- `'activity'` (required) represents the top level impact name.
- `'impact`' (required) represents the impact of an activity.
- `'component'` (required) represents a specific component of an impact (e.g. a specific pollutant) to return.
- if `version=?` (optional - number) is specified, a specific version of the impact factor is returned. If not, the latest version is always returned.
- if `group=?` (optional - string) is specified, the impact factor will be read from the specified group instead of the current group by default.
- if `tenant=?` (optional - string) is specified, the impact factor will be read from the specified tenant instead of the current tenant by default.

## Misc functions

### `LOOKUP` function

Returns a specific value from a reference dataset.

```
LOOKUP( 'value', 'name',  'keyColumn', 'outputColumn',  version=?, group=?, tenant=? )
```

Where:

- `'value'` (required) is the value to use as the lookup from the first column of the reference dataset.
- `'name'` (required) is the name of the reference dataset to search.
- `'keyColumn'` (required) is the name of the column within the reference dataset to key on.
- `'outputColumn'` (required) is the name of the column within the reference dataset to return.
- if `version=?` (optional - number) is specified, a specific version of the reference dataset is returned. If not, the latest version is always returned.
- if `group=?` (optional - string) is specified, the reference dataset will be read from the specified group instead of the current group by default.
- if `tenant=?` (optional - string) is specified, the reference dataset will be read from the specified tenant instead of the current tenant by default.

### `REF` function

Returns the output from a previous calculation as part of a pipeline transform.

Note: this function may only be used within the context of a pipeline transform. It may not be used within the context of a custom calculation definition.

```
REF ( 'output' )
```

Where:

- `'output'` (required) represents the name of the output within the pipeline transform to reference.

## Custom defined functions

Custom defined functions are referenced by prefixing the name of the function with a `#`.

```
#custom_function ( parameters..., version=?, group=?, tenant=? )
```

Where:
- `custom_function` (required) is the name of the custom defined calculation.
- `parameters` (required) represent any defined parameters for the calculation.
- if `version=?` (optional) is specified, a specific version of the calculation is returned. If not, the latest version is always returned.
- if `group=?` (optional) is specified, the calculation will be read from the specified group instead of the current group by default.
- if `tenant=?` (optional) is specified, the calculation will be read from the specified tenant instead of the current tenant by default.

## Pipeline Parameters

Any parameters defined as part of a pipeline are automatically made available to the formula. pipeline parameters are referenced by prefixing the parameter name with `:`.

Pipeline parameters are readonly.

```
:name
```

Where:
- `name` (required) is a valid column name from the pipeline input source.

## Variables

When formulas start becoming complex, formulas can be broken into smaller pieces by using variables to reference the different portions. The variables can also be used to label data with a descriptive name so that the formulas can be understood more clearly by the reader.

Variables must be initialized before they can be referenced. They are initialized using the `set` keyword. The `set` keyword can be used to update existing variables too.

Once initialized, variables can be later referenced by prefixing the variable name with a `:`.

As pipeline parameters are also referenced by prefixing with `:`, it is not allowed to name a variable the same as a pipeline parameter.

When using variables, line breaks are used to mark the separation between expressions.

```
set :myVariable = expr1
set :myVariable = :myVariable * 10
CONCAT( 'The total is ', :myVariable, ' units.' )
```

Where:
- `set :name = value` sets a variable called `name` to the `value`
- `:name` references the variable




