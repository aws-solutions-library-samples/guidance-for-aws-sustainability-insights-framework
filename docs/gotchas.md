# Known gotchas to be wary of

## CDK synth/deply issue

When using cdk to synth / deploy you may encounter an error such as the following:

```shell
❯ cdk synth -c tenantId=exampletenant -c environment=dev -c userPoolId=us-west-2_LIIVPxHLC
...
                                                                                                                                                                                                         ^
Error: Failed to bundle asset exampletenant-dev-CalculationApi/CalculationApi/Apilambda/Code/Stage, bundle output is located at /Users/someone/git/sustainability-saas/packages/apps/calculations/cdk.out/bundling-temp-b9231b53efbc19ef88742e3b425543f31058cc4d3357bb53eaeaa9c8f1894942-error: Error: bash -c npx --no-install esbuild --bundle "/Users/someone/git/sustainability-saas/packages/apps/calculations/src/lambda.ts" --target=node18.16 --platform=node --format=esm --outfile="/Users/someone/git/sustainability-saas/packages/apps/calculations/cdk.out/bundling-temp-b9231b53efbc19ef88742e3b425543f31058cc4d3357bb53eaeaa9c8f1894942/index.mjs" --minify --sources-content=false --external:aws-sdk --banner:js="import { createRequire } from 'module';const require = createRequire(import.meta.url);import { fileURLToPath } from 'url';import { dirname } from 'path';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);" run in directory /Users/someone/git/sustainability-saas exited with status 1
    at AssetStaging.bundle (/Users/someone/git/sustainability-saas/common/temp/node_modules/.pnpm/aws-cdk-lib@2.36.0_constructs@10.1.71/node_modules/aws-cdk-lib/core/lib/asset-staging.js:2:614)
    at AssetStaging.stageByBundling (/Users/someone/git/sustainability-saas/common/temp/node_modules/.pnpm/aws-cdk-lib@2.36.0_constructs@10.1.71/node_modules/aws-cdk-lib/core/lib/asset-staging.js:1:4314)
    at stageThisAsset (/Users/someone/git/sustainability-saas/common/temp/node_modules/.pnpm/aws-cdk-lib@2.36.0_constructs@10.1.71/node_modules/aws-cdk-lib/core/lib/asset-staging.js:1:1675)
    at Cache.obtain (/Users/someone/git/sustainability-saas/common/temp/node_modules/.pnpm/aws-cdk-lib@2.36.0_constructs@10.1.71/node_modules/aws-cdk-lib/core/lib/private/cache.js:1:242)
    at new AssetStaging (/Users/someone/git/sustainability-saas/common/temp/node_modules/.pnpm/aws-cdk-lib@2.36.0_constructs@10.1.71/node_modules/aws-cdk-lib/core/lib/asset-staging.js:1:2070)
    at new Asset (/Users/someone/git/sustainability-saas/common/temp/node_modules/.pnpm/aws-cdk-lib@2.36.0_constructs@10.1.71/node_modules/aws-cdk-lib/aws-s3-assets/lib/asset.js:1:736)
    at AssetCode.bind (/Users/someone/git/sustainability-saas/common/temp/node_modules/.pnpm/aws-cdk-lib@2.36.0_constructs@10.1.71/node_modules/aws-cdk-lib/aws-lambda/lib/code.js:1:4628)
    at new Function (/Users/someone/git/sustainability-saas/common/temp/node_modules/.pnpm/aws-cdk-lib@2.36.0_constructs@10.1.71/node_modules/aws-cdk-lib/aws-lambda/lib/function.js:1:2803)
    at new NodejsFunction (/Users/someone/git/sustainability-saas/common/temp/node_modules/.pnpm/aws-cdk-lib@2.36.0_constructs@10.1.71/node_modules/aws-cdk-lib/aws-lambda-nodejs/lib/function.js:1:1171)
    at new CalculationApi (file:///Users/someone/git/sustainability-saas/packages/apps/calculations/infra/construct.ts:72:21)
```

For some reason it cannot run the esbuild command. Copy, paste, and execute the raw esbuild command from the stack trace above, followed by rerunning the original cdk command. As an example the esbuild command copied from the above stack trace would be:

```shell
npx --no-install esbuild --bundle "/Users/someone/git/sustainability-saas/packages/apps/calculations/src/lambda.ts" --target=node18.16 --platform=node --format=esm --outfile="/Users/someone/git/sustainability-saas/packages/apps/calculations/cdk.out/bundling-temp-b9231b53efbc19ef88742e3b425543f31058cc4d3357bb53eaeaa9c8f1894942/index.mjs" --minify --sources-content=false --external:aws-sdk --banner:js="import { createRequire } from 'module';const require = createRequire(import.meta.url);import { fileURLToPath } from 'url';import { dirname } from 'path';const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);"
```
