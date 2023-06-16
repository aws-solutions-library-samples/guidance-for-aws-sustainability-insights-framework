# Change Log - @sif/integration-tests

This log was last generated on Thu, 15 Jun 2023 23:37:53 GMT and should not be manually modified.

## 3.13.0
Thu, 15 Jun 2023 23:37:53 GMT

### Minor changes

- Add new integration tests for cleanroom integration

## 3.12.0
Mon, 29 May 2023 05:49:44 GMT

### Minor changes

- increment timeout to cater for lockign

## 3.11.4
Thu, 25 May 2023 14:48:59 GMT

### Patches

- Add user/groups tags integration tests

## 3.11.3
Mon, 22 May 2023 22:02:58 GMT

### Patches

- updates

## 3.11.2
Tue, 16 May 2023 13:42:14 GMT

### Patches

- updated integration tests

## 3.11.1
Fri, 05 May 2023 04:45:10 GMT

### Patches

- Added data seeding script

## 3.11.0
Mon, 01 May 2023 00:31:09 GMT

### Minor changes

- refactor integration tests for schema changes

## 3.10.1
Mon, 24 Apr 2023 00:20:29 GMT

### Patches

- add tests tha uses camel case and capital case when specifyin variable in calculation

## 3.10.0
Wed, 05 Apr 2023 19:11:53 GMT

### Minor changes

- add integration tests for inline processing

## 3.9.2
Mon, 03 Apr 2023 22:24:19 GMT

### Patches

- add scenario to grant/revoke processor to groups

## 3.9.1
Mon, 03 Apr 2023 20:15:09 GMT

### Patches

- integration test update

## 3.9.0
Fri, 31 Mar 2023 09:43:49 GMT

### Minor changes

-  new audit log query endpoint based on activity id

## 3.8.1
Fri, 31 Mar 2023 06:04:14 GMT

### Patches

- pipeline plugin feature related enhancement

## 3.8.0
Thu, 16 Mar 2023 04:36:57 GMT

### Minor changes

- add integration tests for pipeline output aggregation

## 3.7.0
Mon, 27 Feb 2023 00:40:07 GMT

### Minor changes

- add calculator syntax test that refers to other resources

## 3.6.2
Fri, 24 Feb 2023 05:33:21 GMT

### Patches

- reverting change

## 3.6.1
Thu, 23 Feb 2023 17:52:11 GMT

### Patches

- updated integration tests

## 3.6.0
Thu, 23 Feb 2023 03:06:01 GMT

### Minor changes

- add tests for the dry run feature

## 3.5.0
Wed, 22 Feb 2023 21:08:53 GMT

### Minor changes

- add integration tests to filter request based on activation time

## 3.4.0
Thu, 16 Feb 2023 16:46:28 GMT

### Minor changes

- Updated test for the creation of null activityValues

### Patches

- modify integration tests to show case how pipeline execution will replace/aggregate with previous result

## 3.3.2
Tue, 07 Feb 2023 16:06:19 GMT

_Version update only_

## 3.3.1
Mon, 06 Feb 2023 19:20:10 GMT

### Patches

- updated integration test pipeline-processor

## 3.3.0
Mon, 06 Feb 2023 02:11:05 GMT

### Minor changes

- add integration tests for retrieving and validating output log

## 3.2.4
Thu, 02 Feb 2023 23:02:22 GMT

### Patches

- Documentation updates as part of open sourcing.

## 3.2.3
Thu, 02 Feb 2023 18:01:35 GMT

### Patches

- Documentation updates as part of open sourcing.

## 3.2.2
Fri, 27 Jan 2023 05:24:10 GMT

### Patches

- Updated AWS dependency versions.
- updated integration tests

## 3.2.1
Wed, 11 Jan 2023 17:56:20 GMT

### Patches

- reference dataset integration test update

## 3.2.0
Tue, 10 Jan 2023 10:07:04 GMT

### Minor changes

- allow cross tenant communication

## 3.1.1
Thu, 22 Dec 2022 18:34:17 GMT

### Patches

- updated integration tests related to reference dataset ehancements

## 3.1.0
Fri, 16 Dec 2022 23:30:23 GMT

### Minor changes

- add more tests for pagination

## 3.0.0
Thu, 08 Dec 2022 23:33:17 GMT

### Breaking changes

- add includeChildGroups and includeParentGroups to allow list to search up and down the hierarchy

## 2.2.2
Tue, 22 Nov 2022 18:09:10 GMT

### Patches

- updated integration tests to cover new API's

## 2.2.1
Tue, 22 Nov 2022 04:58:52 GMT

### Patches

- updated integration tests for activities

## 2.2.0
Tue, 22 Nov 2022 03:49:43 GMT

### Minor changes

- add tests to check creating/modifying configuration in group hierarchy

## 2.1.2
Tue, 22 Nov 2022 00:20:17 GMT

### Patches

- Intermittent activity test failures

## 2.1.1
Fri, 18 Nov 2022 18:36:43 GMT

### Patches

- Added tests for pipeline-processor

## 2.1.0
Thu, 17 Nov 2022 17:33:24 GMT

### Minor changes

- add test to check that generating upload signed url should also return pipeline and execution id

## 2.0.0
Thu, 17 Nov 2022 01:00:36 GMT

### Breaking changes

- rename ssaas to sif

## 1.4.0
Tue, 15 Nov 2022 22:04:19 GMT

### Minor changes

- changed authentication flow to SRP

## 1.3.0
Mon, 14 Nov 2022 11:32:32 GMT

### Minor changes

- added additional tests for activity status

## 1.2.0
Wed, 09 Nov 2022 03:53:58 GMT

### Minor changes

- add option to upload reference dataset using signed url

## 1.1.2
Mon, 07 Nov 2022 16:31:46 GMT

### Patches

-  update access role for create/update api to allow contributors access

## 1.1.1
Thu, 03 Nov 2022 20:32:23 GMT

### Patches

-  fix extranoues attributes on create/updates api requests

## 1.1.0
Tue, 01 Nov 2022 15:42:15 GMT

### Minor changes

- add new script to generate postman environment

## 1.0.1
Tue, 01 Nov 2022 04:21:49 GMT

### Patches

- fixed url path for reference datasets

## 1.0.0
Wed, 26 Oct 2022 22:42:43 GMT

### Breaking changes

- modify the signed url generation HTTP Action to POST

## 0.4.1
Tue, 25 Oct 2022 17:28:09 GMT

### Patches

- Added end-to-end integration test

## 0.4.0
Tue, 18 Oct 2022 03:36:27 GMT

### Minor changes

- added integration tests for fzen/disabled states

## 0.3.1
Fri, 14 Oct 2022 06:33:58 GMT

### Patches

- add --passWithNoTests when running jest and ensure that generate token is not executed when running jest

## 0.3.0
Fri, 14 Oct 2022 05:30:44 GMT

### Minor changes

- allow user to set new password for new user

