package com.aws.sif.resources.caml;

public class CamlNotEnabledException extends Exception {
    public CamlNotEnabledException(String errorMessage) {
        super(errorMessage);
    }

    public CamlNotEnabledException(String errorMessage, Throwable cause) {
        super(errorMessage, cause);
    }
}

