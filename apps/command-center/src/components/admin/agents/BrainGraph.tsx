import { useEffect, useRef } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import { select } from "d3-selection";
import { zoom } from "d3-zoom";
import { drag } from "d3-drag";
import type { GraphLink, GraphNode } from "../../../lib/brainGraph";

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = { source: SimNode; target: SimNode };

// The Obsidian-style force graph, with the mockup's settings: link distance
// 46, charge -120, collide r+10, zoom 0.5 to 3, hover dims the rest to 0.2.
// d3 owns the <svg> contents; React only owns the element.
export default function BrainGraph({ nodes, links, height }: { nodes: GraphNode[]; links: GraphLink[]; height: number }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth || 480;
    const h = height;
    const svg = select(el);
    svg.selectAll("*").remove();

    // Copies: d3 writes x/y and swaps link ends for node objects.
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = links.flatMap((l) => {
      const s = byId.get(l.source);
      const t = byId.get(l.target);
      return s && t ? [{ source: s, target: t }] : [];
    });

    // Theme colours as CSS vars set through style (presentation attributes
    // ignore var()), so a theme switch recolours the graph without a rerun.
    const line = "var(--ag-graph-line)";
    const fill = (n: SimNode) => n.color ?? "var(--text-faint)";

    const sim = forceSimulation<SimNode>(simNodes)
      .force("link", forceLink<SimNode, SimLink>(simLinks).distance(46).strength(0.6))
      .force("charge", forceManyBody().strength(-120))
      .force("center", forceCenter(w / 2, h / 2 - 10))
      .force("collide", forceCollide<SimNode>((d) => d.r + 10));

    const g = svg.append("g");
    svg.call(
      zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 3])
        .on("zoom", (e) => g.attr("transform", e.transform)),
    );

    const link = g
      .append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .style("stroke", line)
      .attr("stroke-width", 1);

    const node = g
      .append("g")
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(simNodes)
      .join("circle")
      .attr("r", (d) => d.r)
      .style("fill", fill)
      .style("stroke", "var(--rail)")
      .attr("stroke-width", 2)
      .style("cursor", "grab")
      .call(
        drag<SVGCircleElement, SimNode>()
          .on("start", (e, d) => {
            if (!e.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (e, d) => {
            d.fx = e.x;
            d.fy = e.y;
          })
          .on("end", (e, d) => {
            if (!e.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    const label = g
      .append("g")
      .selectAll("text")
      .data(simNodes)
      .join("text")
      .attr("class", (d) => `ag-node-label${d.kind === "lesson" ? "" : " big"}`)
      .attr("text-anchor", "middle")
      .text((d) => d.label);

    const touches = (l: SimLink, id: string) => l.source.id === id || l.target.id === id;
    node
      .on("mouseenter", (_e, d) => {
        const near = new Set([d.id]);
        for (const l of simLinks) {
          if (l.source.id === d.id) near.add(l.target.id);
          if (l.target.id === d.id) near.add(l.source.id);
        }
        node.attr("opacity", (n) => (near.has(n.id) ? 1 : 0.2));
        label.attr("opacity", (n) => (near.has(n.id) ? 1 : 0.15));
        link
          .attr("stroke-opacity", (l) => (touches(l, d.id) ? 1 : 0.15))
          .style("stroke", (l) => (touches(l, d.id) ? fill(d) : line));
      })
      .on("mouseleave", () => {
        node.attr("opacity", 1);
        label.attr("opacity", 1);
        link.attr("stroke-opacity", 1).style("stroke", line);
      });

    sim.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x ?? 0)
        .attr("y1", (d) => d.source.y ?? 0)
        .attr("x2", (d) => d.target.x ?? 0)
        .attr("y2", (d) => d.target.y ?? 0);
      node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
      label.attr("x", (d) => d.x ?? 0).attr("y", (d) => (d.y ?? 0) + d.r + 12);
    });

    return () => {
      sim.stop();
      svg.on(".zoom", null);
      svg.selectAll("*").remove();
    };
  }, [nodes, links, height]);

  return <svg ref={ref} height={height} />;
}
