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
  const svgGroupRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  
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
    
    // Hash includes note count to ensure we rebuild if disconnected nodes are added
    const hash = JSON.stringify(links.map(l => `${l.source}-${l.target}`)) + notes.length + JSON.stringify(nData.map(n => n.id));
    return { nodesData: nData, linksData: links, linksHash: hash };
  }, [notes]);

  const graphData = useMemo(() => ({ nodesData, linksData }), [linksHash]);

  // Helper to center view on a specific node ID without restarting sim
  const centerOnNode = (id: string | null) => {
      if (!id || !svgRef.current || !zoomRef.current || !simulationRef.current) return;
      
      const nodes = simulationRef.current.nodes() as any[];
      const node = nodes.find(n => n.id === id);
      
      if (node && node.x !== undefined && dimensions.width > 0) {
          const scale = 1.5;
          const x = dimensions.width / 2 - (node.x * scale);
          const y = dimensions.height / 2 - (node.y * scale);
          const transform = d3.zoomIdentity.translate(x, y).scale(scale);
          
          d3.select(svgRef.current)
            .transition()
            .duration(750)
            .call(zoomRef.current.transform, transform);
      }
  };

  // 3. Initialize/Update Simulation (Only when data or dimensions change)
  useEffect(() => {
    if (!svgRef.current || graphData.nodesData.length === 0 || dimensions.width === 0) return;

    // Persist positions from previous simulation to avoid "reloading" jump
    const oldNodesMap = new Map<string, any>(
      (simulationRef.current?.nodes() || []).map((n: any) => [n.id, n])
    );
    
    const d3Nodes = graphData.nodesData.map(d => {
        const old = oldNodesMap.get(d.id);
        if (old) {
            return { ...d, x: old.x, y: old.y, vx: old.vx, vy: old.vy };
        }
        return { ...d }; 
    });
    const d3Links = graphData.linksData.map(d => ({ ...d }));

    // Clear SVG only if completely necessary, but D3 join handles updates well.
    // For simplicity in this structure, we wipe and rebuild the visual elements 
    // but keep the physics state via `d3Nodes`.
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); 

    const width = dimensions.width;
    const height = dimensions.height;

    // Zoom Group
    const g = svg.append("g");
    svgGroupRef.current = g;

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    
    zoomRef.current = zoom;
    svg.call(zoom);
    // Disable double click zoom
    svg.on("dblclick.zoom", null);

    // Force Simulation
    const simulation = d3.forceSimulation(d3Nodes as any)
      .force("link", d3.forceLink(d3Links).id((d: any) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      // Dynamic collision radius based on text length to prevent overlap
      // Increased buffer slightly
      .force("collide", d3.forceCollide().radius((d: any) => {
          // Base radius (25) + approximate character width (5px) * length
          // This ensures long titles push other nodes away
          return 25 + (d.title ? d.title.length * 5 : 0);
      }).strength(1.0))
      .velocityDecay(0.6) 
      .alphaDecay(0.04);

    simulationRef.current = simulation;

    // --- RENDER ORDER: Lines first, then Nodes, then Labels (on top) ---
    
    const link = g.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(d3Links)
      .join("line")
      .attr("stroke", COLORS.blue)
      .attr("stroke-opacity", 0.3)
      .attr("stroke-width", 1.5);

    const node = g.append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(d3Nodes)
      .join("circle")
      .attr("r", 8) // Radius is controlled in tick/useEffect, but base is 8
      .attr("fill", COLORS.purple)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("cursor", "pointer")
      .on("click", (event, d: any) => {
        event.stopPropagation();
        onNodeClick(d.id);
        // Note: We do NOT restart simulation here to prevent jitter
      })
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Labels with background (to improve readability)
    const labelGroup = g.append("g").attr("class", "labels");
    
    const labels = labelGroup
      .selectAll("text")
      .data(d3Nodes)
      .join("text")
      .attr("dx", 14)
      .attr("dy", 4)
      .text((d: any) => d.title)
      .attr("fill", "#e5e5e5")
      .attr("font-size", "11px")
      .attr("font-family", "sans-serif")
      .attr("pointer-events", "none")
      .style("paint-order", "stroke")
      .style("stroke", "#0a0a0a") // Outline stroke to separate from lines
      .style("stroke-width", "3px");

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

    // Initial centering if active note exists
    if (activeNoteId) {
       // Small delay to allow simulation to warm up initial positions
       setTimeout(() => centerOnNode(activeNoteId), 50);
    }

  }, [graphData.linksHash, dimensions]); // REMOVED activeNoteId from here to prevent re-simulating

  // 4. Handle Visual Highlight & Camera Move (Separate Effect)
  useEffect(() => {
    if (!svgRef.current || !activeNoteId) return;

    // Just update visual attributes, do NOT restart physics
    d3.select(svgRef.current)
        .selectAll("circle")
        .transition().duration(300)
        .attr("r", (d: any) => d.id === activeNoteId ? 14 : 8)
        .attr("fill", (d: any) => d.id === activeNoteId ? COLORS.orange : COLORS.purple);

    // Move camera
    centerOnNode(activeNoteId);

  }, [activeNoteId, dimensions]); // Only runs when selection changes or screen resizes

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