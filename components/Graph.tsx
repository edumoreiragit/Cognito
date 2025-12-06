import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Note, Link as GraphLink } from '../types';
import { COLORS } from '../constants';

interface GraphProps {
  notes: Note[];
  activeNoteId: string | null;
  onNodeClick: (noteId: string) => void;
}

const Graph: React.FC<GraphProps> = ({ notes, activeNoteId, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 }); // Start with 0 to trigger effect on first measure
  const simulationRef = useRef<d3.Simulation<any, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity); // Store current zoom transform

  // Resize Observer to handle split view transitions properly
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Extract links logic
  const { nodesData, linksData, linksHash } = useMemo(() => {
    const links: GraphLink[] = [];
    const titleToIdMap = new Map<string, string>(
      notes.map(n => [n.title.toLowerCase(), n.id] as [string, string])
    );
    
    const nData = notes.map(d => ({ id: d.id, title: d.title }));

    notes.forEach(sourceNote => {
      const regex = /\[\[(.*?)\]\]/g;
      let match;
      while ((match = regex.exec(sourceNote.content)) !== null) {
        const targetTitle = match[1].toLowerCase();
        const targetId = titleToIdMap.get(targetTitle);
        if (targetId) {
          links.push({ source: sourceNote.id, target: targetId });
        }
      }
    });
    
    const hash = JSON.stringify(links.map(l => `${l.source}-${l.target}`)) + notes.length;

    return { nodesData: nData, linksData: links, linksHash: hash };
  }, [notes]);

  const graphData = useMemo(() => ({ nodesData, linksData }), [linksHash]);

  // Update Simulation Center Force when dimensions change
  useEffect(() => {
      if (simulationRef.current && dimensions.width > 0 && dimensions.height > 0) {
          simulationRef.current.force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2));
          simulationRef.current.alpha(0.3).restart();
      }
  }, [dimensions]);

  // Initialize/Update Graph
  useEffect(() => {
    if (!svgRef.current || graphData.nodesData.length === 0 || dimensions.width === 0) return;

    // Preserve existing nodes position if they exist to prevent "explosion" on re-render
    const oldNodesMap = new Map<string, any>(
      (simulationRef.current?.nodes() || []).map((n: any) => [n.id, n])
    );
    
    const d3Nodes = graphData.nodesData.map(d => {
        const old = oldNodesMap.get(d.id);
        if (old) {
            const o = old as any;
            return { ...d, x: o.x, y: o.y, vx: o.vx, vy: o.vy };
        }
        return { ...d };
    });
    const d3Links = graphData.linksData.map(d => ({ ...d }));

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); 

    const width = dimensions.width;
    const height = dimensions.height;

    // Group for zoom
    const g = svg.append("g");

    // Apply last known transform
    if (transformRef.current) {
        g.attr("transform", transformRef.current.toString());
    }

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        transformRef.current = event.transform;
      });
    
    zoomRef.current = zoom;
    svg.call(zoom);
    // Restore zoom state to SVG element
    svg.call(zoom.transform, transformRef.current);

    const simulation = d3.forceSimulation(d3Nodes as any)
      .force("link", d3.forceLink(d3Links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(30));

    simulationRef.current = simulation;

    const link = g.append("g")
      .attr("stroke", COLORS.blue)
      .attr("stroke-opacity", 0.4)
      .selectAll("line")
      .data(d3Links)
      .join("line")
      .attr("stroke-width", 1.5);

    const node = g.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(d3Nodes)
      .join("circle")
      .attr("r", (d: any) => d.id === activeNoteId ? 12 : 8)
      .attr("fill", (d: any) => d.id === activeNoteId ? COLORS.orange : COLORS.purple)
      .attr("cursor", "pointer")
      .on("click", (event, d: any) => {
        event.stopPropagation();
        onNodeClick(d.id);
      })
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    const labels = g.append("g")
      .attr("class", "labels")
      .selectAll("text")
      .data(d3Nodes)
      .join("text")
      .attr("dx", 15)
      .attr("dy", 4)
      .text((d: any) => d.title)
      .attr("fill", "#e5e5e5")
      .attr("font-size", "12px")
      .attr("pointer-events", "none")
      .style("text-shadow", "1px 1px 2px #000");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);

      labels
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [graphData, dimensions.width, dimensions.height, onNodeClick]); // Re-run if dimensions change drastically or data changes

  // Update Highlighted Node Effect (Separate from full re-render)
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    // Update visuals
    svg.selectAll("circle")
        .transition().duration(300)
        .attr("r", (d: any) => d.id === activeNoteId ? 14 : 8)
        .attr("fill", (d: any) => d.id === activeNoteId ? COLORS.orange : COLORS.purple);

    // Camera Pan to Node
    if (activeNoteId && simulationRef.current && zoomRef.current) {
        // Must delay slightly to allow simulation to have coordinates
        const node = simulationRef.current.nodes().find((n: any) => n.id === activeNoteId);
        if (node && (node.x !== undefined)) {
            svg.transition()
            .duration(750)
            .call(
                zoomRef.current.transform,
                d3.zoomIdentity
                .translate(dimensions.width / 2, dimensions.height / 2)
                .scale(1.5)
                .translate(-node.x, -node.y)
            );
        }
    }
  }, [activeNoteId, dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full bg-cognito-dark relative overflow-hidden rounded-none md:rounded-lg shadow-inner border-b md:border border-cognito-border">
      <div className="absolute top-4 right-4 text-xs text-cognito-blue opacity-50 z-10 pointer-events-none">
        Grafo de Força Interativo
      </div>
      <svg ref={svgRef} width="100%" height="100%" className="w-full h-full block touch-none"></svg>
    </div>
  );
};

export default Graph;