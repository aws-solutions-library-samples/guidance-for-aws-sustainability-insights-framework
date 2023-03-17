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

module.exports = {
	types: [
		{ value: 'feat', name: 'feat:     A new feature' },
		{ value: 'fix', name: 'fix:      A bug fix' },
		{ value: 'docs', name: 'docs:     Documentation only changes' },
		{
			value: 'style',
			name: 'style:    Changes that do not affect the meaning of the code\n            (white-space, formatting, missing semi-colons, etc)',
		},
		{
			value: 'refactor',
			name: 'refactor: A code change that neither fixes a bug nor adds a feature',
		},
		{
			value: 'perf',
			name: 'perf:     A code change that improves performance',
		},
		{ value: 'test', name: 'test:     Adding missing tests' },
		{
			value: 'chore',
			name: 'chore:    Changes to the build process or auxiliary tools\n            and libraries such as documentation generation',
		},
		{ value: 'revert', name: 'revert:   Revert to a commit' },
		{ value: 'WIP', name: 'WIP:      Work in progress' },
	],

	scopes: [
		{ name: 'integration-tests' },
		{ name: 'infrastructure' },
		{ name: 'libraries' },
		{ name: 'access-management' },
		{ name: 'activities' },
		{ name: 'calculations' },
		{ name: 'pipeline-processors' },
		{ name: 'pipelines' },
		{ name: 'reference-datasets' },
		{ name: 'tenancy-management' },
		{ name: 'misc' },
	],

	allowTicketNumber: false,
	isTicketNumberRequired: false,
	ticketNumberPrefix: 'TICKET-',
	ticketNumberRegExp: '\\d{1,5}',

	// it needs to match the value for field type. Eg.: 'fix'
	/*
	scopeOverrides: {
	  fix: [
		{name: 'merge'},
		{name: 'style'},
		{name: 'e2eTest'},
		{name: 'unitTest'}
	  ]
	},
	*/
	// override the messages, defaults are as follows
	messages: {
		type: "Select the type of change that you're committing:",
		scope: '\nDenote the SCOPE of this change (optional):',
		// used if allowCustomScopes is true
		customScope: 'Denote the SCOPE of this change:',
		subject: 'Write a SHORT, IMPERATIVE tense description of the change:\n',
		body: 'Provide a LONGER description of the change (optional). Use "|" to break new line:\n',
		breaking: 'List any BREAKING CHANGES (optional):\n',
		footer: 'List any ISSUES CLOSED by this change (optional). E.g.: #31, #34:\n',
		confirmCommit: 'Are you sure you want to proceed with the commit above?',
	},

	allowCustomScopes: false,
	allowBreakingChanges: ['feat', 'fix'],
	// skip any questions you want
	skipQuestions: ['body'],

	// limit subject length
	subjectLimit: 100,
	// breaklineChar: '|', // It is supported for fields body and footer.
	// footerPrefix : 'ISSUES CLOSED:'
	// askForBreakingChangeFirst : true, // default is false
};
