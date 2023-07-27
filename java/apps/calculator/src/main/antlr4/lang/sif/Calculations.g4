grammar Calculations;

prog
    :  SPACE* expr (NL SPACE* expr)* NL?
    ;

expr
    :   MINUS SPACE* expr                                                					# SignedExpr
    |	left=expr SPACE* op=POW SPACE* right=expr                                         	# PowerExpr
    |   left=expr SPACE* op=( TIMES | DIV ) SPACE* right=expr                             	# MulDivExpr
    |   left=expr SPACE* op=( PLUS | MINUS ) SPACE* right=expr                            	# AddSubExpr
    |   left=expr SPACE* op=( GT | GTE | LT | LTE | DEQ | NEQ ) SPACE* right=expr      		# PredicateExpr

    // specific function declarations
    |   AS_TIMESTAMP LPAREN value=expr COMMA pattern=expr (optionalAsTimestampParams)* RPAREN    	# AsTimestampFunctionExpr
    |   ASSIGN_TO_GROUP LPAREN groupId=expr RPAREN                          # AssignToGroupFunctionExpr
    |   GET_VALUE LPAREN json=expr COMMA query=expr RPAREN                  # GetValueFunctionExpr
    |   COALESCE LPAREN exprList RPAREN                                     # CoalesceFunctionExpr
    |   CONCAT LPAREN exprList RPAREN                                       # ConcatFunctionExpr
    |   CONVERT LPAREN value=expr COMMA fromUnit=expr COMMA toUnit=expr (optionalConvertParams)* RPAREN	# ConvertFunctionExpr
    |   IF LPAREN predicate=expr COMMA true=expr COMMA false=expr RPAREN    # IfFunctionExpr
    |   IMPACT LPAREN activity=expr COMMA impact=expr COMMA component=expr (optionalImpactParams)* RPAREN                       # ImpactFunctionExpr
    |   LOOKUP LPAREN value=expr COMMA name=expr COMMA keyColumn=expr COMMA outputColumn=expr (optionalLookupParams)* RPAREN    # LookupFunctionExpr
    |   SPLIT LPAREN text=expr COMMA regex=expr (optionalSplitParams)* RPAREN index=optionalArrayIndexParam?   # SplitFunctionExpr
    |   CAML LPAREN value=expr RPAREN    										# CamlFunctionExpr
    |   LOWERCASE LPAREN value=expr RPAREN    										# LowercaseFunctionExpr
    |   REF LPAREN columnName=expr RPAREN                                   		# RefFunctionExpr
    |   SWITCH LPAREN value=expr COMMA exprList (optionalSwitchParams)* RPAREN      # SwitchFunctionExpr
    |   UPPERCASE LPAREN value=expr RPAREN    										# UppercaseFunctionExpr
    |   function=CUSTOM_FUNCTION LPAREN exprList (optionalCustomParams)* RPAREN		# CustomFunctionExpr

    |   SET SPACE* name=TOKEN SPACE* EQ SPACE* value=expr 					# SetVariableExpr
    |   atom                                                                # AtomsExpr

    ;

// optional parameter definitions

optionalImpactParams
    : (COMMA optionalCommonParam)
    ;

optionalLookupParams
    : (COMMA optionalCommonParam)
    ;

optionalCustomParams
    : (COMMA optionalCommonParam)
    ;

optionalAsTimestampParams
    : (COMMA timezone=optionalTimezoneParam)
    | (COMMA locale=optionalLocaleParam)
    | (COMMA roundDownTo=optionalRoundDownToParam)
    ;

optionalConvertParams
    : (COMMA qualityKind=optionalQualityKindParam)
    ;

optionalSwitchParams
    : (COMMA defaut=optionalDefaultParam)
    | (COMMA ignoreCase=optionalIgnoreCaseParam)
    ;

optionalSplitParams
    : (COMMA limit=optionalLimitParam)
    ;

optionalCommonParam
    :   group=optionalGroupParam
    |   tenant=optionalTenantParam
    |   version=optionalVersionParam
    |  	versionAsAt=optionalVersionAsAtParam
    ;

// list of expressions
exprList
    : expr (COMMA expr)*
    ;

// simple atoms
atom
    :   LPAREN expr RPAREN          # BracesAtom
    |   NULL                        # Null
    |   BOOLEAN                     # Boolean
    |   SCIENTIFIC_NUMBER           # ScientificAtom
    |   NUMBER                      # NumberAtom
    |   TOKEN                       # TokenAtom
    |   QUOTED_STRING               # QuotedStringAtom
    ;

// optional parameter definitions


optionalVersionParam
    : VERSION EQ expr
    ;

optionalTenantParam
    : TENANT EQ expr
    ;

optionalVersionAsAtParam
	: VERSIONASAT EQ expr
	;

optionalGroupParam
    : GROUP EQ expr
    ;

optionalDefaultParam
    : DEFAULT EQ expr
    ;

optionalIgnoreCaseParam
    : IGNORECASE EQ expr
    ;

optionalQualityKindParam
    : QUALITYKIND EQ expr
    ;

optionalLimitParam
    : LIMIT EQ expr
    ;

optionalLocaleParam
    : LOCALE EQ expr
    ;

optionalTimezoneParam
    : TIMEZONE EQ expr
    ;

optionalRoundDownToParam
    : ROUNDDOWNTO EQ expr
    ;

optionalArrayIndexParam
    : LSQUARE expr RSQUARE
    ;

// function name declarations
AS_TIMESTAMP    : A S US T I M E S T A M P ;
ASSIGN_TO_GROUP : A S S I G N US T O US G R O U P ;
GET_VALUE       : G E T US V A L U E ;
COALESCE        : C O A L E S C E ;
CONCAT          : C O N C A T ;
CONVERT			: C O N V E R T ;
IF              : I F ;
IMPACT          : I M P A C T ;
LOOKUP          : L O O K U P ;
LOWERCASE       : L O W E R C A S E ;
REF             : R E F ;
CAML            : C A M L ;
SET				: S E T ;
SOURCE          : S O U R C E ;
SPLIT           : S P L I T ;
SWITCH          : S W I T C H ;
UPPERCASE       : U P P E R C A S E ;

// parameter name declarations
BOOLEAN  : T R U E | F A L S E ;
DEFAULT  : D E F A U L T ;
GROUP    : G R O U P ;
IGNORECASE : I G N O R E C A S E ;
LOCALE   : L O C A L E ;
NULL     : N U L L ;
QUALITYKIND : Q U A L I T Y K I N D ;
TENANT   : T E N A N T ;
TIMEZONE : T I M E Z O N E ;
VERSION  : V E R S I O N ;
VERSIONASAT : V E R S I O N A S A T;
ROUNDDOWNTO: R O U N D D O W N T O;
LIMIT: L I M I T;

CUSTOM_FUNCTION : HASH VALID_CUSTOM_FUNCTION_START VALID_CUSTOM_FUNCTION_CHAR*;
fragment VALID_CUSTOM_FUNCTION_START : ([a-z]) | ([A-Z]) | US ;
fragment VALID_CUSTOM_FUNCTION_CHAR  : VALID_CUSTOM_FUNCTION_START | ([0-9]);

TOKEN  : COLON VALID_TOKEN_START (VALID_TOKEN_CHAR* VALID_TOKEN_END)? ;
fragment VALID_TOKEN_START : (DIGIT | [a-z] | [A-Z] | US ) ;
fragment VALID_TOKEN_END  : VALID_TOKEN_START | COLON | HASH;
fragment VALID_TOKEN_CHAR  : VALID_TOKEN_END | SPACE;

QUOTED_STRING : SQ (~[\\'] | '\\' [\\'()])* SQ ;

NUMBER: UNSIGNED_INTEGER ('.' (DIGIT) +)?;
SCIENTIFIC_NUMBER: NUMBER (E SIGN? UNSIGNED_INTEGER)?;

fragment SIGN: ('+' | '-');
fragment UNSIGNED_INTEGER: (DIGIT)+;
fragment DIGIT: [0-9];

fragment A : [aA];
fragment B : [bB];
fragment C : [cC];
fragment D : [dD];
fragment E : [eE];
fragment F : [fF];
fragment G : [gG];
fragment H : [hH];
fragment I : [iI];
fragment J : [jJ];
fragment K : [kK];
fragment L : [lL];
fragment M : [mM];
fragment N : [nN];
fragment O : [oO];
fragment P : [pP];
fragment Q : [qQ];
fragment R : [rR];
fragment S : [sS];
fragment T : [tT];
fragment U : [uU];
fragment V : [vV];
fragment W : [wW];
fragment X : [xX];
fragment Y : [yY];
fragment Z : [zZ];

LPAREN   : '(';
RPAREN   : ')';
PLUS     : '+';
MINUS    : '-';
TIMES    : '*';
DIV      : '/';
POW      : '^';

GT       : '>';
GTE      : '>=';
LT       : '<';
LTE      : '<=';
DEQ       : '==';
NEQ      : '!=';

EQ      : '=';
LSQUARE : '[';
RSQUARE : ']';

HASH     : '#';
SQ       : '\'';
COMMA    : SPACE* ',' SPACE* ;
POINT    : '.';
COLON    : ':';
US       : '_';
SPACE    : ' ';

NL
   : SPACE* '\n'
   | SPACE* '\r' '\n'?
   ;

WS       : [ \t]+ -> skip ;

ANY      : . ;

