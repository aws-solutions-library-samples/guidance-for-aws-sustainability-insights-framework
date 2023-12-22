package com.aws.sif;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.annotations.SerializedName;
import org.apache.commons.codec.binary.Base64;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class DecodedUser {

	public String sub;
	@SerializedName(value = "cognito:groups")
	public String[] cognitoGroups;
	public Map<String, String> groups;

	public static DecodedUser getDecoded(String encodedToken) throws UnsupportedEncodingException {
		String[] pieces = encodedToken.split("\\.");
		String b64payload = pieces[1];
		String jsonString = new String(Base64.decodeBase64(b64payload), StandardCharsets.UTF_8);
		var token = new Gson().fromJson(jsonString, DecodedUser.class);
		token.groups = new HashMap<>();
		for (int index = 0; index < token.cognitoGroups.length; index++) {
			String[] arrOfStr = token.cognitoGroups[index].split("\\|\\|\\|",2);
			token.groups.put(arrOfStr[0], arrOfStr[1]);
		}
		return token;
	}

	public String toString() {
		Gson gson = new GsonBuilder().setPrettyPrinting().create();
		return gson.toJson(this);
	}
}
