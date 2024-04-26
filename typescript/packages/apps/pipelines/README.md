# Pipelines Overview

## Introduction

The Pipelines module allows you to set up data transformation workflows. By configuring a pipeline, you can dictate how to process incoming data to produce the desired results.

Designing a pipeline involves the following steps:

1. Configure the source of data (which input data connector to use).
1. Specify the format of the incoming data.
1. Outline the necessary transformations to achieve your desired output (for instance, computing CO₂e based on the given input).
1. If needed, aggregate the data for consolidated views.
1. Optionally, designate certain outputs to be monitored as key performance indicators (metrics).

## Data Input Connectors

A data input connector instructs SIF how to connect to a specific data source in order to retrieve the data for processing. Out of the box SIF includes the following connectors:

- `sif-csv-pipeline-input-connector`: allows ingesting data stored as CSV
- `sif-cleanRooms-pipeline-input-connector`: allows running query using AWS CleanRooms and uses the result as pipeline input
- `sif-dataZone-pipeline-input-connector`: allows ingesting data asset published in DataZone.


## Walk-through(s)
- [Simple Area of Shape Transformation](./docs/simple-area-of-shape-transformation.md)
- [Pipeline Connectors](./docs/pipeline-connectors.md)
- [Pipeline Types](./docs/pipeline-types.md)
- [Automate Product Matching using ML with SIF and CaML](./docs/pipeline-caml.md)

## Additonal Links
- [Design Document](./docs/design.md)
- [Swagger](./docs/swagger.json)
