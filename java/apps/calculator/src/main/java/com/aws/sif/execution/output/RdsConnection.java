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

package com.aws.sif.execution.output;
import lombok.SneakyThrows;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Properties;
import com.typesafe.config.Config;
import software.amazon.awssdk.services.rds.RdsUtilities;
import software.amazon.awssdk.services.rds.model.GenerateAuthenticationTokenRequest;
import software.amazon.awssdk.services.rds.model.RdsException;

public class RdsConnection {
    private Connection connection = null;
    private String databaseName;
    private String username;
    private String writerEndpoint;
    private RdsUtilities rdsUtilities;

    public RdsConnection(RdsUtilities rdsUtilities) {
        this.rdsUtilities = rdsUtilities;
    }

    private String getAuthToken(String dbInstanceIdentifier, String masterUsername) {

        try {
            GenerateAuthenticationTokenRequest tokenRequest = GenerateAuthenticationTokenRequest.builder()
                    .username(masterUsername)
                    .port(5432)
                    .hostname(dbInstanceIdentifier)
                    .build();

            return this.rdsUtilities.generateAuthenticationToken(tokenRequest);

        } catch (RdsException e) {
            System.out.println(e.getLocalizedMessage());
            System.exit(1);
        }
        return "";
    }

    @SneakyThrows
    public Connection getConnection(Config config) {
        this.databaseName = config.getString("calculator.processed.rdsDatabaseName");
        this.username = config.getString("calculator.processed.username");
        this.writerEndpoint = config.getString("calculator.processed.writerEndpoint");

        String password = this.getAuthToken(this.writerEndpoint, this.username);

        if (connection != null) {
            return connection;
        } else {
            String url = "jdbc:postgresql://" + this.writerEndpoint + "/" + databaseName;
            Properties props = new Properties();
            props.setProperty("user", this.username);
            props.setProperty("password", password);
            props.setProperty("ssl", "true");
            props.setProperty("sslfactory", "org.postgresql.ssl.DefaultJavaSSLFactory");
            connection = DriverManager.getConnection(url, props);
            return connection;
        }
    }
}
