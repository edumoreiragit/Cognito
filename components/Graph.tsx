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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 }); 
  const simulationRef = useRef<d3.Simulation<any, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  // 1. Detect Resize
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

  // 2. Prepare Data
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

  // 3. Initialize/Update Simulation
  useEffect(() => {
    if (!svgRef.current || graphData.nodesData.length === 0 || dimensions.width === 0) return;

    const oldNodesMap = new Map<string, any>(
      (simulationRef.current?.nodes() || []).map((n: any) => [n.id, n])
    );
    
    const d3Nodes = graphData.nodesData.map(d => {
        const old = oldNodesMap.get(d.id);
        if (old) {
            const o = old as any;
            return { ...d, x: o.x, y: o.y, vx: o.vx, vy: o.vy };
        }
        return { ...d }; // New nodes start undefined, simulation places them
    });
    const d3Links = graphData.linksData.map(d => ({ ...d }));

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); 

    const width = dimensions.width;
    const height = dimensions.height;

    // Zoom Group
    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    
    zoomRef.current = zoom;
    svg.call(zoom);

    // Force Simulation
    const simulation = d3.forceSimulation(d3Nodes as any)
      .force("link", d3.forceLink(d3Links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(30));

    // Warm up the simulation slightly to prevent 0,0 coordinates on first render
    if (!simulationRef.current) {
        simulation.tick(20); 
    }

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
      .attr("r", (d: any) => d.id === activeNoteId ? 14 : 8)
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

    // Force Center Active Node immediately after simulation setup
    if (activeNoteId) {
        // Need a small timeout to let D3 calculate initial positions if it's a fresh simulation
        setTimeout(() => {
             const targetNode = d3Nodes.find((n: any) => n.id === activeNoteId) as any;
             if (targetNode && targetNode.x !== undefined && svgRef.current && zoomRef.current) {
                 const scale = 1.5;
                 const x = -targetNode.x * scale + dimensions.width / 2;
                 const y = -targetNode.y * scale + dimensions.height / 2;
                 const transform = d3.zoomIdentity.translate(x, y).scale(scale);
                 
                 d3.select(svgRef.current).call(zoomRef.current.transform, transform);
             }
        }, 50);
    }

    return () => {
      simulation.stop();
    };
  }, [graphData, dimensions, onNodeClick]); // Removed activeNoteId from here to prevent full re-render loop

  // 4. Handle Active Node Centering / Highlight (Lightweight)
  useEffect(() => {
    if (!svgRef.current || !simulationRef.current || !zoomRef.current || !activeNoteId) return;
    
    const svg = d3.select(svgRef.current);
    
    // Update visual styles
    svg.selectAll("circle")
        .transition().duration(300)
        .attr("r", (d: any) => d.id === activeNoteId ? 14 : 8)
        .attr("fill", (d: any) => d.id === activeNoteId ? COLORS.orange : COLORS.purple);

    // Pan Camera to Node
    const nodes = simulationRef.current.nodes() as any[];
    const targetNode = nodes.find(n => n.id === activeNoteId);
    
    if (targetNode && targetNode.x !== undefined) {
        const scale = 1.5;
        // Center math: (ScreenCenter) - (NodePos * Scale)
        const x = dimensions.width / 2 - (targetNode.x * scale);
        const y = dimensions.height / 2 - (targetNode.y * scale);
        
        const transform = d3.zoomIdentity.translate(x, y).scale(scale);

        svg.transition()
           .duration(750)
           .call(zoomRef.current.transform, transform);
    }
  }, [activeNoteId, dimensions]); // This handles the pan when note changes OR window resizes

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