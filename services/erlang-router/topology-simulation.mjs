// A JavaScript simulation of the DD-005 cluster topology.
//
// IMPORTANT: this exercises **no Erlang**. It models the intended room-agent
// topology — N nodes, newest-only local mailboxes, node-loss isolation — in
// plain JS so the design's latency and isolation properties can be reasoned
// about before anything is built. The earlier unbuildable Erlang sketch was
// archived because nothing compiled, ran, or depended on it (#258).
//
// It is therefore a design model, not coverage of a relay implementation. Do
// not read a passing run as evidence that a clustered relay works.

import { performance } from 'node:perf_hooks';

const NODES = 3;
const SUBSCRIBERS = 5000;
const FRAMES = 180;
const P99_TARGET_MS = 30;

class Subscriber {
  constructor(nodeId, id) {
    this.nodeId = nodeId;
    this.id = id;
    this.latest = null;
    this.received = 0;
    this.dropped = 0;
  }

  deliver(frame, publishedAt) {
    if (this.latest !== null) this.dropped++;
    this.latest = frame;
    this.received++;
    return performance.now() - publishedAt;
  }
}

class RelayNode {
  constructor(id) {
    this.id = id;
    this.subscribers = [];
    this.alive = true;
  }

  addSubscriber(subscriber) {
    this.subscribers.push(subscriber);
  }

  fanout(frame, publishedAt) {
    if (!this.alive) return [];
    const latencies = [];
    for (const subscriber of this.subscribers) latencies.push(subscriber.deliver(frame, publishedAt));
    return latencies;
  }
}

function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
}

export function simulateClusterTopology({ nodes = NODES, subscribers = SUBSCRIBERS, frames = FRAMES } = {}) {
  const cluster = Array.from({ length: nodes }, (_, id) => new RelayNode(id));
  for (let i = 0; i < subscribers; i++) {
    const node = cluster[i % nodes];
    node.addSubscriber(new Subscriber(node.id, i));
  }

  const latencies = [];
  const payload = new Uint8Array(76);
  for (let seq = 0; seq < frames; seq++) {
    payload[0] = seq & 0xff;
    const publishedAt = performance.now();
    for (const node of cluster) latencies.push(...node.fanout(payload, publishedAt));
  }

  const failedNode = cluster[1];
  failedNode.alive = false;
  const beforeFailureReceipts = cluster.map((node) => node.subscribers.reduce((sum, sub) => sum + sub.received, 0));
  const publishedAt = performance.now();
  for (const node of cluster) node.fanout(payload, publishedAt);
  const afterFailureReceipts = cluster.map((node) => node.subscribers.reduce((sum, sub) => sum + sub.received, 0));
  const localOnlyDrop = afterFailureReceipts.every((count, index) => {
    if (index === failedNode.id) return count === beforeFailureReceipts[index];
    return count > beforeFailureReceipts[index];
  });

  return {
    nodes,
    subscribers,
    frames,
    p50Ms: percentile(latencies, 0.50),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    targetP99Ms: P99_TARGET_MS,
    pass: percentile(latencies, 0.99) < P99_TARGET_MS && localOnlyDrop,
    localOnlyDrop,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = simulateClusterTopology();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);
}
