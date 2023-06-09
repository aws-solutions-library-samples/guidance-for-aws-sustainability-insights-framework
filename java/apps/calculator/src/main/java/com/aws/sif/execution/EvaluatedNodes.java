package com.aws.sif.execution;

import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import java.util.HashMap;
import java.util.Map;

/**
 * WIP - not in use yet
 */
@Slf4j
public class EvaluatedNodes {

	Map<Integer, EvaluatedNode> nodes;

	@Setter
	EvaluatedNode root;

	EvaluatedNodes() {
		this.nodes = new HashMap<>();
	}

	public EvaluatedNode get(int id) {
		return this.nodes.get(id);
	}

	public EvaluatedNode put(int id, EvaluatedNode node) {
		this.nodes.put(id, node);
		return node;
	}

	public void print() {
		log.info("print>");
		nodes.forEach((id, node) -> log.info("{} - {}", id, node));

		print(null, root);
	}

	private void print(EvaluatedNode parent, EvaluatedNode current) {
		if (parent==null) {
			log.info("ROOT -> {} : {}", current.id, current.text);
		} else {
			log.info("{} -> {} : {}", parent.id, current.id, current.text);
//			log.info(String.format("%1$" + (level+1) + "s", current.text));
		}

		for(var child : current.children) {
			print(current, child);
		}
	}
}
