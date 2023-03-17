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

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.ToString;

import javax.crypto.SecretKey;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@EqualsAndHashCode(of = {"email","groups"})
@ToString(of = {"email","groups"})
public class Authorizer {

    @Getter
    private final String groupContextId;

    @Getter
    private final String email;
    @Getter private final Set<String> groups;

    private final SecretKey secretKey;

    public Authorizer(String email, String groupContextId, Set<String> groups) {
        this.email = email;
        this.groupContextId = groupContextId;
        this.groups = groups;
        // TODO: may need to standardize and share a signing key via config. Generating one as modules don't verify the key as that's the responsibility of the IdP.
        this.secretKey = Keys.secretKeyFor(SignatureAlgorithm.HS256);
    }

    private Map<String,Object> getClaims(String targetGroupContextId, Optional<String> tenantId) {
        var cognitoGroups = groups.stream().map(g -> String.format("%s|||reader", g)).collect(Collectors.joining(","));

        var claims = new HashMap<String,Object>(Map.of(
                "email", String.format("Calculator (%s)", email),
                "cognito:groups", cognitoGroups
        ));

        tenantId.ifPresentOrElse(
                t->{
                    claims.put("tenantId", t);
                    claims.put("groupContextId", groupContextId);
                },
                ()->claims.put("groupContextId", targetGroupContextId)
        );

        return claims;
    }

    public Map<String,Object> buildRequestContextAuthorizer(String targetGroupContextId, Optional<String> tenantId) {
        return Map.of("claims", getClaims(targetGroupContextId, tenantId));
    }

    public String buildJwt(String targetGroupContextId, Optional<String> tenantId) {
        return Jwts.builder()
                .setSubject("Calculator")
                .addClaims(getClaims(targetGroupContextId, tenantId))
                .signWith(secretKey)
                .compact();

    }
}
