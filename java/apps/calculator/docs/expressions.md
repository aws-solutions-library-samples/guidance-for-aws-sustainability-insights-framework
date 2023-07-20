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
- `pattern` (required) is the date / time pattern of the provided `value` to convert from (see [Supported date / time patterns](./dateTimePatterns.md)).
- if `roundDownTo=?` (optional - string) is specified, timestamp will be round down to beginning of `day/week/month/quarter/year` depending on the specified input. This is used when you want to aggregate your pipeline output by a period of time. Supported values are `day`, `week`, `month`, `quarter` and `year`.
- if `timezone=?` (optional - string) is specified, the provided timezone (e.g. `America/Denver`) is used to convert the `value` to a UTC timestamp. Recommended if the provided `value` does not contain a timezone. If the `value` does not contain a timezone, and `timezone` is not provided, then the system default is used.
- if `locale=?` (optional - string) is specified, the provided locale will be used to convert the `value` using the `pattern` using the `locale` specified. The `locale` can be represented as a [ISO language code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes), or a [ISO language code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes) and [ISO Country Code](https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes), e.g. `fr` for French, or `fr-CA` for French Canadian.


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


### `SPLIT` function

Split the provided text given the delimiter that separates them. If specifying an index, the string at the index is returned, otherwise the whole array is returned as a string.

```
SPLIT( text, regex, limit=? )[ index ]
```

Where:

- `text` (required) the text that would be split into multiple string by the delimiter.
- `regex` (required) the delimiting regular expression.
- `limit` (optional) the limit parameter controls the number of times the pattern is applied and therefore affects the length of the resulting array.
- `index` (optional) if specified, the function will return the string at the specified index.

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
IMPACT( 'activity', 'impact', 'component', version=?, versionAsAt=?, group=?, tenant=? )
```

Where:

- `'activity'` (required) represents the top level impact name.
- `'impact`' (required) represents the impact of an activity.
- `'component'` (required) represents a specific component of an impact (e.g. a specific pollutant) to return.
- if `version=?` (optional - number) is specified, a specific version of the impact factor is returned. If not, the latest version is always returned.
- if `versionAsAt=?` (optional - date string) is specified, the latest version of the impact factor bounded by `createdAt` or [`activeAt`](../../../../typescript/packages/apps/impacts/src/activities/schemas.ts#L71)  property. If not, the latest version is always returned. If both `versionAsAt` and `version` are specified, the former will take precedence.
- if `group=?` (optional - string) is specified, the impact factor will be read from the specified group instead of the current group by default.
- if `tenant=?` (optional - string) is specified, the impact factor will be read from the specified tenant instead of the current tenant by default.

## Miscellaneous functions

### `ASSIGN_TO_GROUP` function

Given a value `(group_value)`, the pipeline processor will apply this group to the output when saving activity values and calculating metrics. In this way every row can be assigned a group context dependent on a calculated value rather than using the `groupContextId` of the execution for every output row. For example, a single pipeline could process data from multiple locations and using `ASSIGN_TO_GROUP` assign that location's group to the output row. `ASSIGN_TO_GROUP` can only be used in one transformer output per pipeline and the `group_value` passed in must either be equal to or a child of the group context of the execution.

```
ASSIGN_TO_GROUP(group_value)
```

Where:

- `group_value` (required) string value specifying which group context to apply to this output row

### `CONVERT` function

Converts a number from one measurement to another.

```
CONVERT( value, 'fromUnit', 'toUnit', quantityKind=? )
```

Where:

- `value` (required) is the number to convert.
- `'fromUnit'` (required) is the unit of measure (provided as either the UOM name or symbol) to convert from. See [conversions](./conversions.md) for a list of supported units.
- `'toUnit'` (required) is the unit of measure (provided as either the UOM name or symbol) to convert to. See [conversions](./conversions.md) for a list of supported units.
- If the `'toUnit'` and/or `'fromUnit'` are provided as symbols instead of names, then the `'quantityKind'` is required. See [conversions](./conversions.md) for a list of supported quantity kinds.

### `LOOKUP` function

Returns a specific value from a reference dataset.

```
LOOKUP( 'value', 'name',  'keyColumn', 'outputColumn',  version=?, versionAsAt=?, group=?, tenant=? )
```

Where:

- `'value'` (required) is the value to use as the lookup from the first column of the reference dataset.
- `'name'` (required) is the name of the reference dataset to search.
- `'keyColumn'` (required) is the name of the column within the reference dataset to key on.
- `'outputColumn'` (required) is the name of the column within the reference dataset to return.
- if `version=?` (optional - number) is specified, a specific version of the reference dataset is returned. If not, the latest version is always returned.
- if `versionAsAt=?` (optional - date string) is specified, the latest version of the reference dataset bounded by `createdAt` or [`activeAt`](../../../../typescript/packages/apps/reference-datasets/src/referenceDatasets/schemas.ts#L83) property. If not, the latest version is always returned. If both `versionAsAt` and `version` are specified, the former will take precedence.
- if `group=?` (optional - string) is specified, the reference dataset will be read from the specified group instead of the current group by default.
- if `tenant=?` (optional - string) is specified, the reference dataset will be read from the specified tenant instead of the current tenant by default.

### `REF` function

Returns the output from a previous calculation of a column of the same row being transformed.

Note: this function may only be used within the context of a pipeline transform. It may not be used within the context of a custom calculation definition.

```
REF ( 'output' )
```

Where:

- `'output'` (required) represents the name of the output within the pipeline transform to reference.



### `CAML` function

Perform semantic text similarity matching using [CaML](https://www.amazon.science/publications/caml-carbon-footprinting-of-household-products-with-zero-shot-semantic-text-similarity) model between input string and the text description of products and return the top 5 matches.

The evaluated response list will include:
1. [NAICS codes](https://www.census.gov/programs-surveys/economic-census/year/2022/guidance/understanding-naics.html)
2. BEA code
3. Title of the product
4. CO2E per dollar
5. Prediction confidence rate.

Note: this function may only be used within the context of a pipeline transform. It may not be used within the context of a custom calculation definition.

```
CAML ( 'value' )
```

Where:

- `'value'` (required) represents string that will be used to match description of the product.


### `GET_VALUE` function

Given JSON as the input, will return the value after evaluating the JsonPath query.

```
GET_VALUE( 'JSON', 'query' )
```

Where:

- `'json'` (required) represents JSON that we want to query.
- `'query`' (required) represents the JsonPath query that we will use to retrieve a value .


## Custom defined functions

Custom defined functions are referenced by prefixing the name of the function with a `#`.

```
#custom_function ( parameters..., version=?, versionAstAt=?, group=?, tenant=? )
```

Where:
- `custom_function` (required) is the name of the custom defined calculation.
- `parameters` (required) represent any defined parameters for the calculation.
- if `version=?` (optional) is specified, a specific version of the calculation is returned. If not, the latest version is always returned.
- if `versionAsAt=?` (optional - date string) is specified, the latest version of the calculation bounded by `createdAt` or [`activeAt`](../../../../typescript/packages/apps/calculations/src/calculations/schemas.ts#L147) property. If not, the latest version is always returned. If both `versionAsAt` and `version` are specified, the former will take precedence.
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

