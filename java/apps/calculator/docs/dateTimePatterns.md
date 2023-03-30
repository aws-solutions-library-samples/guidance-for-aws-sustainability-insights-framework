# Date / Time Patterns

The following lists the supported date / time patterns as used by the `AS_TIMESTAMP()` function:

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
