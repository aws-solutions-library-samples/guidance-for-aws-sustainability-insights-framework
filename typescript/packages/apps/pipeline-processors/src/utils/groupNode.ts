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


export class GroupNode {

	private name: string;
    private parent: GroupNode;
    private children: {[key: string]: GroupNode};
    private isRoot: boolean;

    public constructor (groupName: string, groupParent: GroupNode) {
        this.name = groupName;
        this.children = {};
        this.isRoot = false;
        this.parent = groupParent;
    }

    public setRoot(root: boolean): void {
        this.isRoot = root;
    }
    public isLeaf(): boolean {
        return (Object.keys(this.children).length === 0);
    }

    public addChildrenByPath(groupPath: string): void {
        const pathTokens = groupPath.split('/');
        if (pathTokens.length <= 1) {
            return;
        }

        // if a child exists, get that child then add the children underneath by path...else create the child
        const childGroupName = pathTokens[1];
        let childGroupChildrenPath: string = undefined;
		if (pathTokens.length > 2) {
			childGroupChildrenPath = "/" + pathTokens.slice(2).join('/');
		}
        if (Object.keys(this.children).includes(childGroupName)) {
            if (childGroupChildrenPath) {
                this.children[childGroupName].addChildrenByPath(childGroupChildrenPath);
            }
        } else {
            const child = new GroupNode(childGroupName, this);
            if (childGroupChildrenPath) {
                child.addChildrenByPath(childGroupChildrenPath);
            }
            this.children[childGroupName] = child;
        }
    }

    public getLeafNodes(): string[] {
        let leafNodes: string[] = [];
        if (this.isLeaf()) {
            leafNodes.push(this.getPath());
        } else {
            Object.keys(this.children).forEach((c) => {
                leafNodes = leafNodes.concat(this.children[c].getLeafNodes());
            });
        }
        return leafNodes;
    }

    private getPath(): string {
        if (this.isRoot) {
            return '/';
        } else {
            return this.parent.isRoot ? `${this.parent.getPath()}${this.name}` : `${this.parent.getPath()}/${this.name}`;
        }
    }
}
