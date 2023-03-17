SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Name: unit; Type: TYPE; Schema: public; Owner: #tenantUser
--

CREATE TYPE public.unit AS ENUM (
    'd',
    'w',
    'q',
    'm',
    'y'
);


ALTER TYPE public.unit OWNER TO #tenantUser;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: #activityTable; Type: TABLE; Schema: public; Owner: #tenantUser
--

CREATE TABLE public."#activityTable" (
    "activityId" integer NOT NULL,
    "groupId" character varying(128) NOT NULL,
    "pipelineId" character(26) NOT NULL,
    "date" timestamp without time zone NOT NULL,
    "key1" character varying(128),
    "key2" character varying(128),
    "key3" character varying(128),
    "key4" character varying(128),
    "key5" character varying(128)
);


ALTER TABLE public."#activityTable" OWNER TO #tenantUser;

--
-- Name: #activityBooleanValueTable; Type: TABLE; Schema: public; Owner: #tenantUser
--

CREATE TABLE public."#activityBooleanValueTable" (
    "activityId" integer NOT NULL,
    name character varying(128) NOT NULL,
    "createdAt" timestamp without time zone NOT NULL,
    "executionId" character(26) NOT NULL,
    val boolean,
	error boolean,
	"errorMessage" character varying(512)
);


ALTER TABLE public."#activityBooleanValueTable" OWNER TO #tenantUser;

--
-- Name: #activityDateTimeValueTable; Type: TABLE; Schema: public; Owner: #tenantUser
--

CREATE TABLE public."#activityDateTimeValueTable" (
    "activityId" integer NOT NULL,
    name character varying(128) NOT NULL,
    "createdAt" timestamp without time zone NOT NULL,
    "executionId" character(26) NOT NULL,
    val timestamp without time zone,
	error boolean,
	"errorMessage" character varying(512)
);


ALTER TABLE public."#activityDateTimeValueTable" OWNER TO #tenantUser;

--
-- Name: #activityNumberValueTable; Type: TABLE; Schema: public; Owner: #tenantUser
--

CREATE TABLE public."#activityNumberValueTable" (
    "activityId" integer NOT NULL,
    name character varying(128) NOT NULL,
    "createdAt" timestamp without time zone NOT NULL,
    "executionId" character(26) NOT NULL,
    val numeric(16,6),
	error boolean,
	"errorMessage" character varying(512)
);


ALTER TABLE public."#activityNumberValueTable" OWNER TO #tenantUser;

--
-- Name: Activity_activityId_seq; Type: SEQUENCE; Schema: public; Owner: #tenantUser
--

CREATE SEQUENCE public."Activity_activityId_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public."Activity_activityId_seq" OWNER TO #tenantUser;

--
-- Name: Activity_activityId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: #tenantUser
--

ALTER SEQUENCE public."Activity_activityId_seq" OWNED BY public."Activity"."activityId";


--
-- Name: #activityStringValueTable; Type: TABLE; Schema: public; Owner: #tenantUser
--

CREATE TABLE public."#activityStringValueTable" (
    "activityId" integer NOT NULL,
    name character varying(128) NOT NULL,
    "createdAt" timestamp without time zone NOT NULL,
    "executionId" character(26) NOT NULL,
    val character varying(128),
	error boolean,
	"errorMessage" character varying(512)
);


ALTER TABLE public."#activityStringValueTable" OWNER TO #tenantUser;


--
-- Name: #activityTable activityId; Type: DEFAULT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityTable" ALTER COLUMN "activityId" SET DEFAULT nextval('public."#activityTable_activityId_seq"'::regclass);

--
-- Name: #activityTable_activityId_seq; Type: SEQUENCE SET; Schema: public; Owner: #tenantUser
--

SELECT pg_catalog.setval('public."#activityTable_activityId_seq"', 1, false);


--
-- Name: #activityBooleanValueTable #activityBooleanValueTable_pkey; Type: CONSTRAINT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityBooleanValueTable"
    ADD CONSTRAINT "#activityBooleanValueTable_pkey" PRIMARY KEY ("activityId", name, "createdAt");


--
-- Name: #activityDateTimeValueTable #activityDateTimeValueTable_pkey; Type: CONSTRAINT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityDateTimeValueTable"
    ADD CONSTRAINT "#activityDateTimeValueTable_pkey" PRIMARY KEY ("activityId", name, "createdAt");


--
-- Name: #activityNumberValueTable #activityNumberValueTable_pkey; Type: CONSTRAINT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityNumberValueTable"
    ADD CONSTRAINT "#activityNumberValueTable_pkey" PRIMARY KEY ("activityId", name, "createdAt");


--
-- Name: #activityTable #activityTable_pkey; Type: CONSTRAINT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityTable"
    ADD CONSTRAINT "#activityTable_pkey" PRIMARY KEY ("activityId");


--
-- Name: #activityTable #activityTable_ukey; Type: CONSTRAINT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityTable"
    ADD CONSTRAINT "#activityTable_ukey" UNIQUE ("groupId", "pipelineId", "date", "key1", "key2", "key3", "key4", "key5");

--
-- Name: #activityStringValueTable #activityStringValueTable_pkey; Type: CONSTRAINT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityStringValueTable"
    ADD CONSTRAINT "#activityStringValueTable_pkey" PRIMARY KEY ("activityId", name, "createdAt");


--
-- Name: #activityStringValueTable #activityTable; Type: FK CONSTRAINT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityStringValueTable"
    ADD CONSTRAINT "#activityTable" FOREIGN KEY ("activityId") REFERENCES public."#activityTable"("activityId");


--
-- Name: #activityNumberValueTable #activityTable; Type: FK CONSTRAINT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityNumberValueTable"
    ADD CONSTRAINT "#activityTable" FOREIGN KEY ("activityId") REFERENCES public."#activityTable"("activityId");


--
-- Name: #activityBooleanValueTable #activityTable; Type: FK CONSTRAINT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityBooleanValueTable"
    ADD CONSTRAINT "#activityTable" FOREIGN KEY ("activityId") REFERENCES public."#activityTable"("activityId");


--
-- Name: #activityDateTimeValueTable #activityTable; Type: FK CONSTRAINT; Schema: public; Owner: #tenantUser
--

ALTER TABLE ONLY public."#activityDateTimeValueTable"
    ADD CONSTRAINT "#activityTable" FOREIGN KEY ("activityId") REFERENCES public."#activityTable"("activityId");


--
-- PostgreSQL database dump complete
--

