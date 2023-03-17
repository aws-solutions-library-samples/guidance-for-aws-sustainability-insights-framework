/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

package com.aws.sif;

import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.zeroturnaround.zip.ZipUtil;

import java.io.File;

@Slf4j
public class ZipUtils {

    public void zipDirectory(@NotNull String sourcePath, String destinationPath) {
        log.debug("zipDirectory> in> sourcePath:{}, destinationPath:{}", sourcePath, destinationPath);
        ZipUtil.pack(new File(sourcePath), new File(destinationPath));
        log.debug("zipDirectory> in> exit:");
    }

}
