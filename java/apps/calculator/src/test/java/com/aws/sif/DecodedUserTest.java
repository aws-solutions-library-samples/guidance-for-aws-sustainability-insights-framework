package com.aws.sif;

import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;

@Slf4j
public class DecodedUserTest {

	@Test
	public void happyPath() throws IOException {
		/*
		 * Semgrep issue https://sg.run/05N5
		 * Ignore reason: this is a made up token for unit test purpose
		 */
		var stringToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0NjNlODU4YS04MWQyLTRiZTEtYjFkMC1iMTZmNjc3ZDE0YzkiLCJjb2duaXRvOmdyb3VwcyI6WyIvfHx8YWRtaW4iXX0.0GviY_WsV4rccJfDettlTBFM08sxK5VvlOsDHwktlQg"; // nosemgrep
		DecodedUser token = DecodedUser.getDecoded(stringToken);
		assertEquals("/|||admin", token.cognitoGroups[0]);
		assertEquals("admin", token.groups.get("/"));
	}
}
