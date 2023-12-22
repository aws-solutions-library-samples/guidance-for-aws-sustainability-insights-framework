/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`ALTER TABLE "ActivityStringValue" ALTER COLUMN "val" TYPE character varying(1024);`);
    pgm.sql(`ALTER TABLE "ActivityStringLatestValue" ALTER COLUMN "val" TYPE character varying(1024);`);
};

exports.down = pgm => {};
