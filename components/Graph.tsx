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
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const initializedRef = useRef(false);

  // 1. Detectar redimensionamento do container (ex: ao dividir a tela)
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

  // 2. Preparar dados do grafo
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

  // 3. Atualizar o centro de gravidade quando a tela muda de tamanho
  useEffect(() => {
      if (simulationRef.current && dimensions.width > 0 && dimensions.height > 0) {
          // Move o centro da força para o novo meio da tela
          simulationRef.current.force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2));
          simulationRef.current.alpha(0.3).restart();

          // Force reset/center view on first load of dimensions
          if (!initializedRef.current && svgRef.current && zoomRef.current) {
               d3.select(svgRef.current).call(
                  zoomRef.current.transform, 
                  d3.zoomIdentity.translate(dimensions.width / 2, dimensions.height / 2).scale(1).translate(-dimensions.width/2, -dimensions.height/2) // Just center loosely
               );
               initializedRef.current = true;
          }
      }
  }, [dimensions]);

  // 4. Inicializar/Atualizar Simulação D3
  useEffect(() => {
    if (!svgRef.current || graphData.nodesData.length === 0 || dimensions.width === 0) return;

    // Preservar posições antigas para evitar "explosão" ao atualizar dados
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

    // Grupo para zoom
    const g = svg.append("g");

    // Aplicar transform anterior se existir
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
    
    // Initial centering logic if not already transformed
    if (transformRef.current === d3.zoomIdentity) {
        // Center initial view: Center of SVG
        // Note: Force simulation centers nodes at width/2, height/2.
        // We want the viewport to look at width/2, height/2.
        // By default d3.zoomIdentity looks at 0,0.
        // We don't need to translate if the force center is naturally in the middle of the SVG.
        // However, explicitly setting it ensures consistency.
        // We rely on the forceCenter above to bring nodes to the middle.
    } else {
        svg.call(zoom.transform, transformRef.current);
    }

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
  }, [graphData, dimensions.width, dimensions.height, onNodeClick]);

  // Efeito Visual de Seleção (sem re-renderizar tudo)
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    svg.selectAll("circle")
        .transition().duration(300)
        .attr("r", (d: any) => d.id === activeNoteId ? 14 : 8)
        .attr("fill", (d: any) => d.id === activeNoteId ? COLORS.orange : COLORS.purple);

    // Pan da câmera para o nó selecionado
    if (activeNoteId && simulationRef.current && zoomRef.current) {
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