package com.aws.sif.execution;

import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * WIP - not in use yet
 */
public class EvaluatedNode {

	@Setter @Getter int id;

	@Setter @Getter String text;

	@Getter  @Setter
	DynamicTypeValue result;

	List<EvaluatedNode> children;
	EvaluatedNode parent;

	EvaluatedNode() {
		children = new ArrayList<>();
	}

	public EvaluatedNode addChild(EvaluatedNode node) {
		children.add(node);
		node.parent = this;
		return this;
	}
}
