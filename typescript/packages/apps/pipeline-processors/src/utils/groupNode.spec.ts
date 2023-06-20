import { beforeEach, describe, it, expect } from 'vitest';
import { GroupNode } from './groupNode';

describe('GroupNode', () => {
	let testGroupNode: GroupNode;

	beforeEach(() => {
		testGroupNode = new GroupNode('/', undefined);
		testGroupNode.setRoot(true);
	});

	it('happy path', async () => {
		expect(testGroupNode.getLeafNodes().length).toEqual(1);
		expect(testGroupNode.getLeafNodes()).toEqual(['/']);

		testGroupNode.addChildrenByPath('/usa/co/denver');
		testGroupNode.addChildrenByPath('/usa/co/fraser');
		testGroupNode.addChildrenByPath('/ca/bc/vancouver');
		testGroupNode.addChildrenByPath('/au/wa/perth');
		expect(testGroupNode.getLeafNodes().length).toEqual(4);
		expect(testGroupNode.getLeafNodes()).toEqual(['/usa/co/denver','/usa/co/fraser','/ca/bc/vancouver','/au/wa/perth']);

		testGroupNode.addChildrenByPath("/usa");
		testGroupNode.addChildrenByPath("/usa/tx");
		testGroupNode.addChildrenByPath("/ca/bc/vancouver");
		expect(testGroupNode.getLeafNodes().length).toEqual(5);
		expect(testGroupNode.getLeafNodes()).toEqual(['/usa/co/denver','/usa/co/fraser','/usa/tx','/ca/bc/vancouver','/au/wa/perth']);
	});
});
