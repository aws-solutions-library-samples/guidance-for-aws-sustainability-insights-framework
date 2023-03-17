# Activities Overview

## Introduction

This module allows the user to manage activities that can be used in when calculating emission. The activity resource
can be referenced when users create
the [calculation](../calculations/README.md) resource or [pipeline configuration](../pipelines/README.md) resource.


## REST API

Refer to the [Swagger](docs/swagger.json) for a detailed list of the available REST API endpoints.

## Walkthrough

### Pre-requisite

For this walkthrough, we assume that user had been logged in, has the right permission and the group context is set to `/group1` in the id token generated
by `Cognito`.

For more details access controls and permissions, look at the [Access Management](../access-management/README.md) module.

### Example 1: Creating Activity

#### Request

You can create the activity using as shown below:

```shell
curl --location --request POST 'http://<ACTIVITIES_URL>/activities' \
	--header 'Accept-Version: 1.0.0' \
	--header 'Content-Type: multipart/form-data' \
	--header 'Content-Type: application/json'
	--header 'Authorization: <token>' \
	----data-raw '{
  "name": "emissions:something:Air",
  "description": "excludes carbon sequestration",
  "attributes": {
        "ref_unit":"therm"
  },
  "tags": [
    {
      "key": "type",
      "value": "material/metal/steel"

    },
    {
      "key": "source",
      "value": "emissions",
      "label": "EMISSIONS",
      "description": ""
    }
  ],
  "impacts": {
    "co2e" : {
      "name": "CO2e",
      "attributes": {
        "unit": "kg"
      },
      "components": {
        "co2": {
          "key": "co2",
          "value": 5.304733389,
          "type": "pollutant",
          "description": "",
          "label": ""
        },
        "ch4": {
          "key": "ch4",
          "value": 0.002799332,
          "type": "pollutant",
          "description": "",
          "label": ""
        },
        "n2o": {
          "key": "n2o",
          "value": 0.002649367,
          "type": "pollutant",
          "description": "",
          "label": ""
        },
        "IPCC 2013 AR5 GWP 100": {
          "key": "IPCC 2013 AR5 GWP 100",
          "value": 5.310182088,
          "type": "impactFactor",
          "description": "",
          "label": ""
        },
        "IPCC 2016 AR4 GWP 100": {
          "key": "IPCC 2016 AR4 GWP 100",
          "value": 4.310182088,
          "type": "impactFactor",
          "description": "",
          "label": ""
        }
      }
    }
```

#### Response

```sh
HTTP: 201 OK
Content-Type: application/json

{
    "id": "01gg3yg1gsq3ne5dzy3khxnstf",
    "name": "emissions:something:air",
    "description": "excludes carbon sequestration",
    "attributes": {
        "ref_unit": "therm"
    },
    "version": 1,
    "state": "enabled",
    "impacts": {
        "co2e": {
            "name": "co2e",
            "attributes": {
                "unit": "kg"
            },
            "components": {
                "co2": {
                    "key": "co2",
                    "value": 5.304733389,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "ch4": {
                    "key": "ch4",
                    "value": 0.002799332,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "n2o": {
                    "key": "n2o",
                    "value": 0.002649367,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "ipcc 2013 ar5 gwp 100": {
                    "key": "ipcc 2013 ar5 gwp 100",
                    "value": 5.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                },
                "ipcc 2016 ar4 gwp 100": {
                    "key": "ipcc 2016 ar4 gwp 100",
                    "value": 4.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                }
			}
        }
	},
    "groups": [
        "/group1"
    ],
    "tags": {
        "type": "material/metal/steel",
        "source": "emissions"
    },
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-24T02:52:37.274Z"
}
```

### Example 2: Retrieving The Newly Created Activity

Using the activity id returned by the previous example, you can then retrieve the activity by issuing the following command:

#### Request

```shell
GET /activities/<activityId>
Accept: application/json
```

#### Response

```shell
Content-Type: application/application/json
{
    "id": "01gg3yg1gsq3ne5dzy3khxnstf",
    "name": "emissions:something:air",
    "description": "excludes carbon sequestration",
    "attributes": {
        "ref_unit": "therm"
    },
    "version": 1,
    "state": "enabled",
    "impacts": {
        "co2e": {
            "name": "co2e",
            "attributes": {
                "unit": "kg"
            },
            "components": {
                "co2": {
                    "key": "co2",
                    "value": 5.304733389,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "ch4": {
                    "key": "ch4",
                    "value": 0.002799332,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "n2o": {
                    "key": "n2o",
                    "value": 0.002649367,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "ipcc 2013 ar5 gwp 100": {
                    "key": "ipcc 2013 ar5 gwp 100",
                    "value": 5.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                },
                "ipcc 2016 ar4 gwp 100": {
                    "key": "ipcc 2016 ar4 gwp 100",
                    "value": 4.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                }
			}
        }
	},
    "groups": [
        "/group1"
    ],
    "tags": {
        "type": "material/metal/steel",
        "source": "emissions"
    },
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-24T02:52:37.274Z"
}

```

### Example 3: Listing All Activities On Your Current Group Context

If you create multiple activities, you can list all of them by issuing the following commands (this will return all activities in your **current
group context**):

#### Request

```shell
GET /activities
Accept: application/json
```

#### Response

```shell
Content-Type: application/application/json
{
    "activities": [
        {
            "id": "01gg3yg1gsq3ne5dzy3khxnstf",
            "name": "emissions:something:air",
            "description": "excludes carbon sequestration",
            "attributes": {
                "ref_unit": "therm"
            },
            "version": 1,
            "state": "enabled",
            "impacts": {
                "co2e": {
                    "name": "co2e",
                    "attributes": {
                        "unit": "kg"
                    },
                    "components": {
                "co2": {
                    "key": "co2",
                    "value": 5.304733389,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "ch4": {
                    "key": "ch4",
                    "value": 0.002799332,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "n2o": {
                    "key": "n2o",
                    "value": 0.002649367,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "ipcc 2013 ar5 gwp 100": {
                    "key": "ipcc 2013 ar5 gwp 100",
                    "value": 5.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                },
                "ipcc 2016 ar4 gwp 100": {
                    "key": "ipcc 2016 ar4 gwp 100",
                    "value": 4.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                }
			}
                }
			},
            "groups": [
                "/activitiestagtests/a"
            ],
            "tags": {
                "type": "material/metal/steel",
                "source": "emissions"
            },
            "createdBy": "someone@example.com",
            "createdAt": "2022-10-24T02:52:37.274Z"
        }
    ]
}

```

### Example 4: Modifying Activity

You can modify the activity as shown below:

```shell
PATCH /activities/<activityId>
Accept: application/json
Content-Type: application/json

{
	"description": "updated description",
	"attributes": {
      "ref_unit": "therm"
  	}
}
```

#### Response

```sh
HTTP: 200
Content-Type: application/json

{
    "id": "01gg3yg1gsq3ne5dzy3khxnstf",
    "name": "emissions:something:air",
    "description": "updated description",
    "attributes": {
        "ref_unit": "therm"
    },
    "impacts": {
        "co2e" : {
            "name": "co2e",
            "attributes": {
                "unit": "kg"
            },
            "components": {
                "co2": {
                    "key": "co2",
                    "value": 5.304733389,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "ch4": {
                    "key": "ch4",
                    "value": 0.002799332,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "n2o": {
                    "key": "n2o",
                    "value": 0.002649367,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                "ipcc 2013 ar5 gwp 100": {
                    "key": "ipcc 2013 ar5 gwp 100",
                    "value": 5.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                },
                "ipcc 2016 ar4 gwp 100": {
                    "key": "ipcc 2016 ar4 gwp 100",
                    "value": 4.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                }
			}
        }
	},
    "version": 2,
    "state": "enabled",
    "groups": [
        "/group1"
    ],
    "tags": {
        "type": "material/metal/steel",
        "source": "emissions"
    },
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-24T02:52:37.274Z",
    "updatedAt": "2022-10-24T02:59:38.746Z",
    "updatedBy": "someone@example.com"
}
```

### Example 5: Listing Multiple Versions Of Activity

You can list all the versions of a particular activity by issuing the following command:

#### Request

```shell
GET /activities/<id>/versions
Accept: application/json

```

#### Response

```shell
Content-Type: application/json
{
    "activities": [
        {
            "id": "01gg3yg1gsq3ne5dzy3khxnstf",
            "name": "emissions:something:air",
            "description": "excludes carbon sequestration",
            "attributes": {
                "ref_unit": "therm"
            },
            "version": 1,
            "state": "active",
            "impacts": {
                "co2e": {
                    "name": "co2e",
                    "attributes": {
                        "unit": "kg"
                    },
                    "components": {
						"co2": {
							"key": "co2",
							"value": 5.304733389,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"ch4": {
							"key": "ch4",
							"value": 0.002799332,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"n2o": {
							"key": "n2o",
							"value": 0.002649367,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"ipcc 2013 ar5 gwp 100": {
							"key": "ipcc 2013 ar5 gwp 100",
							"value": 5.310182088,
							"type": "impactFactor",
							"label": "",
							"description": ""
						},
						"ipcc 2016 ar4 gwp 100": {
							"key": "ipcc 2016 ar4 gwp 100",
							"value": 4.310182088,
							"type": "impactFactor",
							"label": "",
							"description": ""
						}
					}
                }
            },
            "groups": [
                "/group1"
            ],
            "tags": {
                "type": "material/metal/steel",
                "source": "emissions"
            },
            "createdBy": "soneone@amazon.com",
            "createdAt": "2022-10-24T02:52:37.274Z"
        },
        {
            "id": "01gg3yg1gsq3ne5dzy3khxnstf",
            "name": "emissions:something:air",
            "description": "updated description",
            "attributes": {
                "ref_unit": "therm"
            },
            "version": 2,
            "state": "active",
            "impacts": {
                "co2e": {
                    "name": "co2e",
                    "attributes": {
                        "unit": "kg"
                    },
                    "components": {
						"co2": {
							"key": "co2",
							"value": 5.304733389,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"ch4": {
							"key": "ch4",
							"value": 0.002799332,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"n2o": {
							"key": "n2o",
							"value": 0.002649367,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"ipcc 2013 ar5 gwp 100": {
							"key": "ipcc 2013 ar5 gwp 100",
							"value": 5.310182088,
							"type": "impactFactor",
							"label": "",
							"description": ""
						},
						"ipcc 2016 ar4 gwp 100": {
							"key": "ipcc 2016 ar4 gwp 100",
							"value": 4.310182088,
							"type": "impactFactor",
							"label": "",
							"description": ""
						}
					}
                }
			},
            "groups": [
                "/group1"
            ],
            "tags": {
                "type": "material/metal/steel",
                "source": "emissions"
            },
            "createdBy": "soneone@amazon.com",
            "createdAt": "2022-10-24T02:52:37.274Z",
            "updatedBy": "soneone@amazon.com",
            "updatedAt": "2022-10-24T02:59:38.746Z"
        }
    ]
}
```

### Example 8: Listing Activities By Tags

You can retrieve all activities using its tag value (and its parent). In the sample above we're creating activities with
tags `Material/Metal/Steel`, this allows user to list the activities by passing that tag value and all its parents (`Material/Metal/Steel`
,`Material/Metal`,`Material`)

#### Request

```shell
GET /activities?tags=type=Material/Metal/Steel
Accept: application/json
```

#### Response

```shell
Content-Type: application/json
{
    "activities": [
        {
            "id": "01gg3yg1gsq3ne5dzy3khxnstf",
            "name": "emissions:something:air",
            "description": "updated description",
            "attributes": {
                "ref_unit": "therm"
            },
            "version": 2,
            "state": "active",
            "impacts": {
                "co2e": {
                    "name": "co2e",
                    "attributes": {
                        "unit": "kg"
                    },
                    "components": {
						"co2": {
							"key": "co2",
							"value": 5.304733389,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"ch4": {
							"key": "ch4",
							"value": 0.002799332,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"n2o": {
							"key": "n2o",
							"value": 0.002649367,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"ipcc 2013 ar5 gwp 100": {
							"key": "ipcc 2013 ar5 gwp 100",
							"value": 5.310182088,
							"type": "impactFactor",
							"label": "",
							"description": ""
						},
						"ipcc 2016 ar4 gwp 100": {
							"key": "ipcc 2016 ar4 gwp 100",
							"value": 4.310182088,
							"type": "impactFactor",
							"label": "",
							"description": ""
						}
					}
                }
			},
            "groups": [
                "/group1"
            ],
            "tags": {
                "type": "material/metal/steel",
                "source": "emissions"
            },
            "createdBy": "soneone@amazon.com",
            "createdAt": "2022-10-24T02:52:37.274Z",
            "updatedBy": "soneone@amazon.com",
            "updatedAt": "2022-10-24T02:59:38.746Z"
        }
    ]
}
```

### Example 9: Listing Activity By Its Alias (Name)

You can retrieve all activities using its alias (`name` is the alias used by Activities module)

#### Request

```shell
GET /activities?name=emissions:something:air
Accept: application/json
```

#### Response

```shell
Content-Type: application/json
{
    "activities": [
        {
            "id": "01gg3yg1gsq3ne5dzy3khxnstf",
            "name": "emissions:something:air",
            "description": "updated description",
            "attributes": {
                "ref_unit": "therm"
            },
            "version": 2,
            "state": "active",
            "impacts": {
                "co2e": {
                    "name": "co2e",
                    "attributes": {
                        "unit": "kg"
                    },
                    "components": {
						"co2": {
							"key": "co2",
							"value": 5.304733389,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"ch4": {
							"key": "ch4",
							"value": 0.002799332,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"n2o": {
							"key": "n2o",
							"value": 0.002649367,
							"type": "pollutant",
							"label": "",
							"description": ""
						},
						"ipcc 2013 ar5 gwp 100": {
							"key": "ipcc 2013 ar5 gwp 100",
							"value": 5.310182088,
							"type": "impactFactor",
							"label": "",
							"description": ""
						},
						"ipcc 2016 ar4 gwp 100": {
							"key": "ipcc 2016 ar4 gwp 100",
							"value": 4.310182088,
							"type": "impactFactor",
							"label": "",
							"description": ""
						}
					}
                }
			},
            "groups": [
                "/group1"
            ],
            "tags": {
                "type": "material/metal/steel",
                "source": "emissions"
            },
            "createdBy": "soneone@amazon.com",
            "createdAt": "2022-10-24T02:52:37.274Z",
            "updatedBy": "soneone@amazon.com",
            "updatedAt": "2022-10-24T02:59:38.746Z"
        }
    ]
}
```
### Example 10: Listing All Tags Created As Part Of Resource Creation

You can retrieve all tags that as filter when you're listing the activities by running the command below:

#### Request

```shell
GET /tags/<tagKey> # In the create example the tagKey is type
Accept: application/json
```

#### Response

```shell
Content-Type: application/json
{
    "values": {
        "material": "material"
    }
}
```

You can also specify `parentValue` in the query string to list its children as shown below:

#### Request

```shell
GET /activities/tags/<tagKey>?parentValue=<parentValue> # In the create example the tagKey is type and parentValue can be material or material/metal
Accept: application/json
```

#### Response

```shell
Content-Type: application/json
{
    "values": {
        "material/metal": "metal"
    }
}
```

You can also manage the underlying impacts and components of an activity please refer to [Impacts](/docs/impacts.md)
or you can create activities in bulk please refer to [Activity Tasks](/docs/activity-tasks.md)
