import React, { useEffect, useRef, useState } from 'react';
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
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Extract links from markdown content [[Link]]
  const getLinks = (notes: Note[]): GraphLink[] => {
    const links: GraphLink[] = [];
    const titleToIdMap = new Map(notes.map(n => [n.title.toLowerCase(), n.id]));

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
    return links;
  };

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!svgRef.current || notes.length === 0) return;

    const linksData = getLinks(notes).map(d => ({ ...d }));
    const nodesData = notes.map(d => ({ id: d.id, title: d.title }));

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous

    const width = dimensions.width;
    const height = dimensions.height;

    // Zoom behavior
    const g = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    const simulation = d3.forceSimulation(nodesData as any)
      .force("link", d3.forceLink(linksData).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(30));

    const link = g.append("g")
      .attr("stroke", COLORS.blue)
      .attr("stroke-opacity", 0.4)
      .selectAll("line")
      .data(linksData)
      .join("line")
      .attr("stroke-width", 1.5);

    const node = g.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodesData)
      .join("circle")
      .attr("r", (d) => d.id === activeNoteId ? 12 : 8)
      .attr("fill", (d) => d.id === activeNoteId ? COLORS.orange : COLORS.purple)
      .attr("cursor", "pointer")
      .on("click", (event, d) => {
        onNodeClick(d.id);
        event.stopPropagation();
      })
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    const labels = g.append("g")
      .attr("class", "labels")
      .selectAll("text")
      .data(nodesData)
      .join("text")
      .attr("dx", 15)
      .attr("dy", 4)
      .text((d) => d.title)
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
  }, [notes, dimensions, activeNoteId, onNodeClick]);

  return (
    <div ref={containerRef} className="w-full h-full bg-cognito-dark relative overflow-hidden rounded-lg shadow-inner border border-cognito-border">
      <div className="absolute top-4 right-4 text-xs text-cognito-blue opacity-50 z-10 pointer-events-none">
        Grafo de Força Interativo
      </div>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="w-full h-full block"></svg>
    </div>
  );
};

export default Graph;