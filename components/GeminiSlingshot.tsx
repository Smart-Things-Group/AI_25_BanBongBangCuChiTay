/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getStrategicHint, TargetCandidate } from '../services/geminiService';
import { Point, Bubble, Particle, BubbleColor, DebugInfo } from '../types';
import { Loader2, Trophy, BrainCircuit, Play, MousePointerClick, Eye, Terminal, Clock, AlertTriangle, Target, Lightbulb, Monitor, RotateCcw } from 'lucide-react';

const PINCH_THRESHOLD = 0.07;
const GRAVITY = 0.0; 
const FRICTION = 0.998; 

const BUBBLE_RADIUS = 22;
const ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3);
const GRID_COLS = 12;
const GRID_ROWS = 8;
const SLINGSHOT_BOTTOM_OFFSET = 220;

const MAX_DRAG_DIST = 180;
const MIN_FORCE_MULT = 0.15;
const MAX_FORCE_MULT = 0.45;

// Material Design Colors & Scoring Strategy
const COLOR_CONFIG: Record<BubbleColor, { hex: string, points: number, label: string }> = {
  red:    { hex: '#ef5350', points: 100, label: 'Red' },     // Material Red 400
  blue:   { hex: '#42a5f5', points: 150, label: 'Blue' },    // Material Blue 400
  green:  { hex: '#66bb6a', points: 200, label: 'Green' },   // Material Green 400
  yellow: { hex: '#ffee58', points: 250, label: 'Yellow' },  // Material Yellow 400
  purple: { hex: '#ab47bc', points: 300, label: 'Purple' },  // Material Purple 400
  orange: { hex: '#ffa726', points: 500, label: 'Orange' }   // Material Orange 400
};

const COLOR_KEYS: BubbleColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

// Color Helper for Gradients
const adjustColor = (color: string, amount: number) => {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
    
    const componentToHex = (c: number) => {
        const hex = c.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
};

const GeminiSlingshot: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  
  // Game State Refs
  const ballPos = useRef<Point>({ x: 0, y: 0 });
  const ballVel = useRef<Point>({ x: 0, y: 0 });
  const anchorPos = useRef<Point>({ x: 0, y: 0 });
  const isPinching = useRef<boolean>(false);
  const isFlying = useRef<boolean>(false);
  const flightStartTime = useRef<number>(0);
  const bubbles = useRef<Bubble[]>([]);
  const particles = useRef<Particle[]>([]);
  const scoreRef = useRef<number>(0);
  
  const aimTargetRef = useRef<Point | null>(null);
  const isAiThinkingRef = useRef<boolean>(false);
  
  // AI Request Trigger
  const captureRequestRef = useRef<boolean>(false);

  // Current active color (Ref for loop, State for UI)
  // Now used for random color that will be shot
  const selectedColorRef = useRef<BubbleColor>('red');
  const nextShotColorRef = useRef<BubbleColor>('red');
  
  // React State
  const [loading, setLoading] = useState(true);
  const [aiHint, setAiHint] = useState<string | null>("Initializing strategy engine...");
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const [aimTarget, setAimTarget] = useState<Point | null>(null);
  const [score, setScore] = useState(0);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [selectedColor, setSelectedColor] = useState<BubbleColor>('red');
  const [nextShotColor, setNextShotColor] = useState<BubbleColor>('red');
  const [availableColors, setAvailableColors] = useState<BubbleColor[]>([]);
  const [aiRecommendedColor, setAiRecommendedColor] = useState<BubbleColor | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const gameOverRef = useRef<boolean>(false);

  // Sync state to ref
  useEffect(() => {
    selectedColorRef.current = selectedColor;
  }, [selectedColor]);

  useEffect(() => {
    nextShotColorRef.current = nextShotColor;
  }, [nextShotColor]);

  useEffect(() => {
    aimTargetRef.current = aimTarget;
  }, [aimTarget]);

  useEffect(() => {
    isAiThinkingRef.current = isAiThinking;
  }, [isAiThinking]);

  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);
  
  const getBubblePos = (row: number, col: number, width: number) => {
    const xOffset = (width - (GRID_COLS * BUBBLE_RADIUS * 2)) / 2 + BUBBLE_RADIUS;
    const isOdd = row % 2 !== 0;
    const x = xOffset + col * (BUBBLE_RADIUS * 2) + (isOdd ? BUBBLE_RADIUS : 0);
    const y = BUBBLE_RADIUS + row * ROW_HEIGHT;
    return { x, y };
  };

  const updateAvailableColors = () => {
    const activeColors = new Set<BubbleColor>();
    bubbles.current.forEach(b => {
        if (b.active) activeColors.add(b.color);
    });
    setAvailableColors(Array.from(activeColors));
    
    // If current selected color is gone, switch to first available
    if (!activeColors.has(selectedColorRef.current) && activeColors.size > 0) {
        const next = Array.from(activeColors)[0];
        setSelectedColor(next);
    }
  };

  const initGrid = useCallback((width: number) => {
    const newBubbles: Bubble[] = [];
    // Use fewer colors for easier gameplay (only 3-4 colors)
    const easyColors: BubbleColor[] = ['red', 'blue', 'green', 'yellow'];
    let currentColor: BubbleColor = easyColors[Math.floor(Math.random() * easyColors.length)];
    let colorStreak = 0;
    const maxStreak = 3; // Create clusters of 3-4 same color bubbles
    
    for (let r = 0; r < 5; r++) { 
      for (let c = 0; c < (r % 2 !== 0 ? GRID_COLS - 1 : GRID_COLS); c++) {
        if (Math.random() > 0.1) {
            const { x, y } = getBubblePos(r, c, width);
            
            // Create color clusters - 70% chance to keep same color, 30% to change
            if (colorStreak >= maxStreak || Math.random() < 0.3) {
                currentColor = easyColors[Math.floor(Math.random() * easyColors.length)];
                colorStreak = 0;
            } else {
                colorStreak++;
            }
            
            newBubbles.push({
              id: `${r}-${c}`,
              row: r,
              col: c,
              x,
              y,
              color: currentColor,
              active: true
            });
        }
      }
    }
    bubbles.current = newBubbles;
    updateAvailableColors();
    
    // Initialize random color for first shot
    const initialRandomColor = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
    setNextShotColor(initialRandomColor);
    nextShotColorRef.current = initialRandomColor;
    selectedColorRef.current = initialRandomColor;
    setSelectedColor(initialRandomColor);
    
    // Trigger initial AI analysis after a short delay to allow render
    setTimeout(() => {
        captureRequestRef.current = true;
    }, 2000);
  }, []);

  const restartGame = useCallback(() => {
    setGameOver(false);
    gameOverRef.current = false;
    setScore(0);
    scoreRef.current = 0;
    particles.current = [];
    isFlying.current = false;
    isPinching.current = false;
    ballPos.current = { ...anchorPos.current };
    ballVel.current = { x: 0, y: 0 };
    setAiHint("Initializing strategy engine...");
    setAiRationale(null);
    setAimTarget(null);
    setDebugInfo(null);
    
    if (canvasRef.current && gameContainerRef.current) {
      const width = gameContainerRef.current.clientWidth;
      initGrid(width);
    }
  }, [initGrid]);

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1.0,
        color
      });
    }
  };

  const isPathClear = (target: Bubble) => {
    if (!anchorPos.current) return false;
    
    const startX = anchorPos.current.x;
    const startY = anchorPos.current.y;
    const endX = target.x;
    const endY = target.y;

    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(distance / (BUBBLE_RADIUS / 2)); 

    for (let i = 1; i < steps - 2; i++) { 
        const t = i / steps;
        const cx = startX + dx * t;
        const cy = startY + dy * t;

        for (const b of bubbles.current) {
            if (!b.active || b.id === target.id) continue;
            const distSq = Math.pow(cx - b.x, 2) + Math.pow(cy - b.y, 2);
            if (distSq < Math.pow(BUBBLE_RADIUS * 1.8, 2)) {
                return false; 
            }
        }
    }
    return true;
  };

  const getAllReachableClusters = (): TargetCandidate[] => {
    const activeBubbles = bubbles.current.filter(b => b.active);
    const uniqueColors = Array.from(new Set(activeBubbles.map(b => b.color))) as BubbleColor[];
    const allClusters: TargetCandidate[] = [];

    // Analyze opportunities for ALL colors
    for (const color of uniqueColors) {
        const visited = new Set<string>();
        
        for (const b of activeBubbles) {
            if (b.color !== color || visited.has(b.id)) continue;

            const clusterMembers: Bubble[] = [];
            const queue = [b];
            visited.add(b.id);

            while (queue.length > 0) {
                const curr = queue.shift()!;
                clusterMembers.push(curr);
                
                const neighbors = activeBubbles.filter(n => 
                    !visited.has(n.id) && n.color === color && isNeighbor(curr, n)
                );
                neighbors.forEach(n => {
                    visited.add(n.id);
                    queue.push(n);
                });
            }

            // Check if this cluster is hittable
            clusterMembers.sort((a,b) => b.y - a.y); 
            const hittableMember = clusterMembers.find(m => isPathClear(m));

            if (hittableMember) {
                const xPct = hittableMember.x / (gameContainerRef.current?.clientWidth || window.innerWidth);
                let desc = "Center";
                if (xPct < 0.33) desc = "Left";
                else if (xPct > 0.66) desc = "Right";

                allClusters.push({
                    id: hittableMember.id,
                    color: color,
                    size: clusterMembers.length,
                    row: hittableMember.row,
                    col: hittableMember.col,
                    pointsPerBubble: COLOR_CONFIG[color].points,
                    description: `${desc}`
                });
            }
        }
    }
    return allClusters;
  };

  const checkMatches = (startBubble: Bubble) => {
    const toCheck = [startBubble];
    const visited = new Set<string>();
    const matches: Bubble[] = [];
    const targetColor = startBubble.color;

    while (toCheck.length > 0) {
      const current = toCheck.pop()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      if (current.color === targetColor) {
        matches.push(current);
        const neighbors = bubbles.current.filter(b => b.active && !visited.has(b.id) && isNeighbor(current, b));
        toCheck.push(...neighbors);
      }
    }

    // Remove all matching bubbles (need at least 3 to match standard bubble shooter)
    if (matches.length >= 3) {
      let points = 0;
      const basePoints = COLOR_CONFIG[targetColor].points;
      
      matches.forEach(b => {
        b.active = false;
        createExplosion(b.x, b.y, COLOR_CONFIG[b.color].hex);
        points += basePoints;
      });
      // Combo Multiplier
      const multiplier = matches.length > 3 ? 1.5 : 1.0;
      scoreRef.current += Math.floor(points * multiplier);
      setScore(scoreRef.current);
      
      // Remove floating bubbles (not connected to top)
      removeFloatingBubbles();
      
      return true;
    }
    return false;
  };

  // Remove bubbles that are not connected to the top row
  const removeFloatingBubbles = () => {
    const activeBubbles = bubbles.current.filter(b => b.active);
    if (activeBubbles.length === 0) return;
    
    // Find all bubbles connected to top row (row 0)
    const topBubbles = activeBubbles.filter(b => b.row === 0);
    const connected = new Set<string>();
    const toCheck = [...topBubbles.map(b => b.id)];
    
    topBubbles.forEach(b => connected.add(b.id));
    
    while (toCheck.length > 0) {
      const currentId = toCheck.pop()!;
      const current = activeBubbles.find(b => b.id === currentId);
      if (!current) continue;
      
      const neighbors = activeBubbles.filter(b => 
        !connected.has(b.id) && isNeighbor(current, b)
      );
      
      neighbors.forEach(n => {
        connected.add(n.id);
        toCheck.push(n.id);
      });
    }
    
    // Remove all bubbles not in connected set
    let removedCount = 0;
    bubbles.current.forEach(b => {
      if (b.active && !connected.has(b.id)) {
        b.active = false;
        createExplosion(b.x, b.y, COLOR_CONFIG[b.color].hex);
        removedCount++;
      }
    });
    
    if (removedCount > 0) {
      const basePoints = COLOR_CONFIG['red'].points; // Use base points for floating bubbles
      scoreRef.current += Math.floor(removedCount * basePoints * 0.5); // Half points for floating
      setScore(scoreRef.current);
    }
  };

  const isNeighbor = (a: Bubble, b: Bubble) => {
    const dr = b.row - a.row;
    const dc = b.col - a.col;
    if (Math.abs(dr) > 1) return false;
    if (dr === 0) return Math.abs(dc) === 1;
    if (a.row % 2 !== 0) {
        return dc === 0 || dc === 1;
    } else {
        return dc === -1 || dc === 0;
    }
  };

  // Function to add new row at top and drop all bubbles down by 1 row
  const addNewRowAndDrop = (canvasWidth: number) => {
    // First, move all existing bubbles down by 1 row and recalculate positions
    bubbles.current.forEach(b => {
      if (b.active) {
        b.row += 1;
        // Recalculate position to ensure it's exactly on the grid
        const newPos = getBubblePos(b.row, b.col, canvasWidth);
        b.x = newPos.x;
        b.y = newPos.y;
      }
    });
    
    // Then, add a new row at the top (row 0) with color clusters
    const newRowBubbles: Bubble[] = [];
    // Use fewer colors for easier gameplay
    const easyColors: BubbleColor[] = ['red', 'blue', 'green', 'yellow'];
    let currentColor: BubbleColor = easyColors[Math.floor(Math.random() * easyColors.length)];
    let colorStreak = 0;
    const maxStreak = 4; // Create clusters of 4-5 same color bubbles
    
    for (let c = 0; c < GRID_COLS; c++) {
      if (Math.random() > 0.1) { // 90% chance to spawn a bubble
        const { x, y } = getBubblePos(0, c, canvasWidth);
        
        // Create color clusters - 75% chance to keep same color, 25% to change
        if (colorStreak >= maxStreak || Math.random() < 0.25) {
            currentColor = easyColors[Math.floor(Math.random() * easyColors.length)];
            colorStreak = 0;
        } else {
            colorStreak++;
        }
        
        newRowBubbles.push({
          id: `0-${c}-${Date.now()}-${Math.random()}`,
          row: 0,
          col: c,
          x,
          y,
          color: currentColor,
          active: true
        });
      }
    }
    bubbles.current.push(...newRowBubbles);
    
    // Clean up any bubbles that might have fallen off the bottom
    bubbles.current = bubbles.current.filter(b => {
      if (!b.active) return true;
      // Keep bubbles that are still on screen (with some margin)
      return b.row < GRID_ROWS + 10;
    });
  };

  // Check if game is over (bubbles too low)
  const checkGameOver = (canvasHeight: number) => {
    const slingshotY = canvasHeight - SLINGSHOT_BOTTOM_OFFSET;
    const dangerY = slingshotY - ROW_HEIGHT * 2; // 2 rows above slingshot (1 row buffer)
    
    for (const b of bubbles.current) {
      if (b.active && b.y >= dangerY) {
        return true;
      }
    }
    return false;
  };

  const performAiAnalysis = async (screenshot: string) => {
    // Lock interaction immediately via ref (fast) and state (render)
    isAiThinkingRef.current = true;
    setIsAiThinking(true);
    setAiHint("Analyzing tactical options...");
    setAiRationale(null);
    setAiRecommendedColor(null);
    setAimTarget(null);

    // Client-Side Pre-Calc for ALL colors
    const allClusters = getAllReachableClusters();
    const maxRow = bubbles.current.reduce((max, b) => b.active ? Math.max(max, b.row) : max, 0);

    const canvasWidth = canvasRef.current?.width || 1000;

    getStrategicHint(
        screenshot,
        allClusters,
        maxRow
    ).then(aiResponse => {
        const { hint, debug } = aiResponse;
        setDebugInfo(debug);
        setAiHint(hint.message);
        setAiRationale(hint.rationale || null);
        
        if (typeof hint.targetRow === 'number' && typeof hint.targetCol === 'number') {
            if (hint.recommendedColor) {
                setAiRecommendedColor(hint.recommendedColor);
                // Note: Color is now random, so we don't set selectedColor anymore
            }
            const pos = getBubblePos(hint.targetRow, hint.targetCol, canvasWidth);
            setAimTarget(pos);
        }
        
        // Unlock
        isAiThinkingRef.current = false;
        setIsAiThinking(false);
    });
  };

  // --- Rendering Helper ---
  const drawBubble = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, colorKey: BubbleColor) => {
    const config = COLOR_CONFIG[colorKey];
    const baseColor = config.hex;
    
    // Main Sphere Gradient (gives 3D depth)
    // Shifted focus to top-left for light source
    const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
    grad.addColorStop(0, '#ffffff');             // Specular highlight center (brightest)
    grad.addColorStop(0.2, baseColor);           // Main color body
    grad.addColorStop(1, adjustColor(baseColor, -60)); // Shadowed edge (darkest)

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle Outline for definition
    ctx.strokeStyle = adjustColor(baseColor, -80);
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Secondary "Glossy" Highlight (Hard reflection)
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.3, y - radius * 0.35, radius * 0.25, radius * 0.15, Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();
  };

  // --- Main Game Loop ---

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !gameContainerRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = gameContainerRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    // Set initial size based on container
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    anchorPos.current = { x: canvas.width / 2, y: canvas.height - SLINGSHOT_BOTTOM_OFFSET };
    ballPos.current = { ...anchorPos.current };
    
    initGrid(canvas.width);

    let camera: any = null;
    let hands: any = null;

    const onResults = (results: any) => {
      setLoading(false);
      
      // Responsive Resize
      if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        anchorPos.current = { x: canvas.width / 2, y: canvas.height - SLINGSHOT_BOTTOM_OFFSET };
        if (!isFlying.current && !isPinching.current) {
          ballPos.current = { ...anchorPos.current };
        }
      }

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw Video Feed
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      // Material Dark Overlay
      ctx.fillStyle = 'rgba(18, 18, 18, 0.85)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // --- Hand Tracking ---
      let handPos: Point | null = null;
      let pinchDist = 1.0;

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const idxTip = landmarks[8];
        const thumbTip = landmarks[4];

        handPos = {
          x: (idxTip.x * canvas.width + thumbTip.x * canvas.width) / 2,
          y: (idxTip.y * canvas.height + thumbTip.y * canvas.height) / 2
        };

        const dx = idxTip.x - thumbTip.x;
        const dy = idxTip.y - thumbTip.y;
        pinchDist = Math.sqrt(dx * dx + dy * dy);

        if (window.drawConnectors && window.drawLandmarks) {
           // Google Blue for tracking lines
           window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {color: '#669df6', lineWidth: 1});
           window.drawLandmarks(ctx, landmarks, {color: '#aecbfa', lineWidth: 1, radius: 2});
        }
        
        // Cursor
        ctx.beginPath();
        ctx.arc(handPos.x, handPos.y, 20, 0, Math.PI * 2);
        ctx.strokeStyle = pinchDist < PINCH_THRESHOLD ? '#66bb6a' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // --- SLINGSHOT LOGIC ---
      
      // Don't allow interaction if game is over
      if (gameOverRef.current) {
        ctx.restore();
        return;
      }
      
      // Check if we are currently "Locked" waiting for AI
      const isLocked = isAiThinkingRef.current;

      if (!isLocked && handPos && pinchDist < PINCH_THRESHOLD && !isFlying.current && !gameOverRef.current) {
        const distToBall = Math.sqrt(Math.pow(handPos.x - ballPos.current.x, 2) + Math.pow(handPos.y - ballPos.current.y, 2));
        if (!isPinching.current && distToBall < 100) {
           isPinching.current = true;
        }
        
        if (isPinching.current) {
            ballPos.current = { x: handPos.x, y: handPos.y };
            const dragDx = ballPos.current.x - anchorPos.current.x;
            const dragDy = ballPos.current.y - anchorPos.current.y;
            const dragDist = Math.sqrt(dragDx*dragDx + dragDy*dragDy);
            
            if (dragDist > MAX_DRAG_DIST) {
                const angle = Math.atan2(dragDy, dragDx);
                ballPos.current.x = anchorPos.current.x + Math.cos(angle) * MAX_DRAG_DIST;
                ballPos.current.y = anchorPos.current.y + Math.sin(angle) * MAX_DRAG_DIST;
            }
        }
      } 
      else if (isPinching.current && (!handPos || pinchDist >= PINCH_THRESHOLD || isLocked)) {
        // Release or Forced Release if Locked
        isPinching.current = false;
        
        if (isLocked) {
             // If we lock while pinching, reset to anchor
             ballPos.current = { ...anchorPos.current };
        } else {
            const dx = anchorPos.current.x - ballPos.current.x;
            const dy = anchorPos.current.y - ballPos.current.y;
            const stretchDist = Math.sqrt(dx*dx + dy*dy);
            
            if (stretchDist > 30) {
                isFlying.current = true;
                flightStartTime.current = performance.now();
                const powerRatio = Math.min(stretchDist / MAX_DRAG_DIST, 1.0);
                const velocityMultiplier = MIN_FORCE_MULT + (MAX_FORCE_MULT - MIN_FORCE_MULT) * (powerRatio * powerRatio);

                ballVel.current = {
                    x: dx * velocityMultiplier,
                    y: dy * velocityMultiplier
                };
            } else {
                ballPos.current = { ...anchorPos.current };
            }
        }
      }
      else if (!isFlying.current && !isPinching.current) {
          const dx = anchorPos.current.x - ballPos.current.x;
          const dy = anchorPos.current.y - ballPos.current.y;
          ballPos.current.x += dx * 0.15;
          ballPos.current.y += dy * 0.15;
      }

      // --- Physics ---
      if (isFlying.current) {
        // Infinite bounce safeguard: if flying for more than 5 seconds (5000ms), cancel shot
        if (performance.now() - flightStartTime.current > 5000) {
            isFlying.current = false;
            ballPos.current = { ...anchorPos.current };
            ballVel.current = { x: 0, y: 0 };
        } else {
            const currentSpeed = Math.sqrt(ballVel.current.x ** 2 + ballVel.current.y ** 2);
            const steps = Math.ceil(currentSpeed / (BUBBLE_RADIUS * 0.8)); 
            let collisionOccurred = false;

            // Wall positions - sát bên 2 bên hàng quả bóng
            const WALL_THICKNESS = 30;
            const xOffset = (canvas.width - (GRID_COLS * BUBBLE_RADIUS * 2)) / 2 + BUBBLE_RADIUS;
            const leftWallX = xOffset - BUBBLE_RADIUS - WALL_THICKNESS;
            const rightWallX = xOffset + (GRID_COLS - 1) * (BUBBLE_RADIUS * 2) + BUBBLE_RADIUS;
            
            for (let i = 0; i < steps; i++) {
                ballPos.current.x += ballVel.current.x / steps;
                ballPos.current.y += ballVel.current.y / steps;
                
                // Bounce off walls
                if (ballPos.current.x < leftWallX + WALL_THICKNESS + BUBBLE_RADIUS) {
                    ballVel.current.x *= -1;
                    ballPos.current.x = leftWallX + WALL_THICKNESS + BUBBLE_RADIUS;
                }
                if (ballPos.current.x > rightWallX - BUBBLE_RADIUS) {
                    ballVel.current.x *= -1;
                    ballPos.current.x = rightWallX - BUBBLE_RADIUS;
                }

                if (ballPos.current.y < BUBBLE_RADIUS) {
                    collisionOccurred = true;
                    break;
                }

                for (const b of bubbles.current) {
                    if (!b.active) continue;
                    const dist = Math.sqrt(
                        Math.pow(ballPos.current.x - b.x, 2) + 
                        Math.pow(ballPos.current.y - b.y, 2)
                    );
                    if (dist < BUBBLE_RADIUS * 1.8) {
                        collisionOccurred = true;
                        break;
                    }
                }
                if (collisionOccurred) break;
            }

            ballVel.current.y += GRAVITY; 
            ballVel.current.x *= FRICTION;
            ballVel.current.y *= FRICTION;

            // Handle collision - always place bubble first, then check for matches
            if (collisionOccurred) {
                isFlying.current = false;
                
                // Find the best position that snaps to grid and is close to collision point
                let bestDist = Infinity;
                let bestRow = 0;
                let bestCol = 0;
                let bestX = 0;
                let bestY = 0;
                const snapDistance = BUBBLE_RADIUS * 2.5; // Maximum distance to snap to grid

                // First, try to find a position near the collision point
                for (let r = 0; r < GRID_ROWS + 5; r++) {
                    const colsInRow = r % 2 !== 0 ? GRID_COLS - 1 : GRID_COLS;
                    for (let c = 0; c < colsInRow; c++) {
                        const { x, y } = getBubblePos(r, c, canvas.width);
                        const occupied = bubbles.current.some(b => b.active && b.row === r && b.col === c);
                        if (occupied) continue;

                        const dist = Math.sqrt(
                            Math.pow(ballPos.current.x - x, 2) + 
                            Math.pow(ballPos.current.y - y, 2)
                        );
                        
                        // Only consider positions within snap distance
                        if (dist < snapDistance && dist < bestDist) {
                            // Check if this position would be adjacent to at least one existing bubble
                            // or if it's close enough to the collision point
                            const hasNeighbor = bubbles.current.some(b => {
                                if (!b.active) return false;
                                const neighborDist = Math.sqrt(
                                    Math.pow(b.x - x, 2) + 
                                    Math.pow(b.y - y, 2)
                                );
                                // Check if it's within 1.9 * radius (adjacent in hexagonal grid)
                                return neighborDist < BUBBLE_RADIUS * 1.9;
                            });
                            
                            // Prefer positions that have neighbors (snap to existing grid)
                            // But also allow positions close to collision if no neighbors found
                            if (hasNeighbor || dist < BUBBLE_RADIUS * 2) {
                                bestDist = dist;
                                bestRow = r;
                                bestCol = c;
                                bestX = x;
                                bestY = y;
                            }
                        }
                    }
                }

                // If no valid position found, find the closest unoccupied position
                if (bestDist === Infinity) {
                    for (let r = 0; r < GRID_ROWS + 5; r++) {
                        const colsInRow = r % 2 !== 0 ? GRID_COLS - 1 : GRID_COLS;
                        for (let c = 0; c < colsInRow; c++) {
                            const { x, y } = getBubblePos(r, c, canvas.width);
                            const occupied = bubbles.current.some(b => b.active && b.row === r && b.col === c);
                            if (occupied) continue;

                            const dist = Math.sqrt(
                                Math.pow(ballPos.current.x - x, 2) + 
                                Math.pow(ballPos.current.y - y, 2)
                            );
                            
                            if (dist < bestDist) {
                                bestDist = dist;
                                bestRow = r;
                                bestCol = c;
                                bestX = x;
                                bestY = y;
                            }
                        }
                    }
                }

                // Always place the bubble first (standard bubble shooter mechanics)
                const shotColor = nextShotColorRef.current;
                
                const newBubble: Bubble = {
                    id: `${bestRow}-${bestCol}-${Date.now()}`,
                    row: bestRow,
                    col: bestCol,
                    x: bestX,
                    y: bestY,
                    color: shotColor,
                    active: true
                };
                bubbles.current.push(newBubble);
                
                // After placing, check for matches (>= 3 same color bubbles)
                checkMatches(newBubble);
                updateAvailableColors();
                
                // Add new row at top and drop all bubbles down by 1 row after each shot
                addNewRowAndDrop(canvas.width);
                
                // Check for game over
                if (!gameOverRef.current && checkGameOver(canvas.height)) {
                    setGameOver(true);
                    gameOverRef.current = true;
                }
                
                // Generate random color for next shot
                const nextRandomColor = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
                setNextShotColor(nextRandomColor);
                nextShotColorRef.current = nextRandomColor;
                selectedColorRef.current = nextRandomColor;
                setSelectedColor(nextRandomColor);
                
                // Reset shot
                ballPos.current = { ...anchorPos.current };
                ballVel.current = { x: 0, y: 0 };

                // Request AI Analysis for next frame (only if not game over)
                if (!gameOver) {
                    captureRequestRef.current = true;
                }
            }
            
            if (ballPos.current.y > canvas.height) {
                isFlying.current = false;
                ballPos.current = { ...anchorPos.current };
                ballVel.current = { x: 0, y: 0 };
            }
        }
      }

      // --- Drawing ---
      
      // Draw Walls (2 side walls sát bên hàng quả bóng)
      const WALL_THICKNESS = 30;
      const xOffset = (canvas.width - (GRID_COLS * BUBBLE_RADIUS * 2)) / 2 + BUBBLE_RADIUS;
      const leftWallX = xOffset - BUBBLE_RADIUS - WALL_THICKNESS;
      const rightWallX = xOffset + (GRID_COLS - 1) * (BUBBLE_RADIUS * 2) + BUBBLE_RADIUS;
      
      // Left Wall
      ctx.save();
      const leftWallGradient = ctx.createLinearGradient(leftWallX, 0, leftWallX + WALL_THICKNESS, 0);
      leftWallGradient.addColorStop(0, '#424242');
      leftWallGradient.addColorStop(0.5, '#616161');
      leftWallGradient.addColorStop(1, '#757575');
      ctx.fillStyle = leftWallGradient;
      ctx.fillRect(leftWallX, 0, WALL_THICKNESS, canvas.height);
      // Wall border
      ctx.strokeStyle = '#212121';
      ctx.lineWidth = 2;
      ctx.strokeRect(leftWallX, 0, WALL_THICKNESS, canvas.height);
      ctx.restore();
      
      // Right Wall
      ctx.save();
      const rightWallGradient = ctx.createLinearGradient(rightWallX, 0, rightWallX + WALL_THICKNESS, 0);
      rightWallGradient.addColorStop(0, '#757575');
      rightWallGradient.addColorStop(0.5, '#616161');
      rightWallGradient.addColorStop(1, '#424242');
      ctx.fillStyle = rightWallGradient;
      ctx.fillRect(rightWallX, 0, WALL_THICKNESS, canvas.height);
      // Wall border
      ctx.strokeStyle = '#212121';
      ctx.lineWidth = 2;
      ctx.strokeRect(rightWallX, 0, WALL_THICKNESS, canvas.height);
      ctx.restore();
      
      // Draw Grid Bubbles
      bubbles.current.forEach(b => {
          if (!b.active) return;
          drawBubble(ctx, b.x, b.y, BUBBLE_RADIUS - 1, b.color);
      });

      // --- Trajectory Line (Previously Commented Out) ---
      // Logic removed per request to clean up file, but previously existed here.

      // Trajectory Line when dragging (Dashed line showing aim direction)
      if (isPinching.current && !isFlying.current) {
          ctx.save();
          const dragDx = ballPos.current.x - anchorPos.current.x;
          const dragDy = ballPos.current.y - anchorPos.current.y;
          const dragDist = Math.sqrt(dragDx * dragDx + dragDy * dragDy);
          
          // Calculate direction from ball to anchor (reverse direction)
          const reverseAngle = Math.atan2(-dragDy, -dragDx); // Reverse of drag direction
          const lineLength = Math.min(dragDist * 2, 600); // Max length for line
          const startX = ballPos.current.x;
          const startY = ballPos.current.y;
          const endX = startX + Math.cos(reverseAngle) * lineLength;
          const endY = startY + Math.sin(reverseAngle) * lineLength;
          
          // Draw dashed line from ball towards anchor
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          
          const time = performance.now();
          const dashOffset = (time / 20) % 40;
          ctx.setLineDash([15, 10]);
          ctx.lineDashOffset = -dashOffset;
          
          // Color intensity based on drag distance (power)
          const powerRatio = Math.min(dragDist / MAX_DRAG_DIST, 1.0);
          const trajectoryColor = COLOR_CONFIG[nextShotColorRef.current].hex;
          const alpha = 0.4 + (powerRatio * 0.4); // 0.4 to 0.8 opacity
          
          ctx.strokeStyle = trajectoryColor;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.shadowBlur = 10;
          ctx.shadowColor = trajectoryColor;
          ctx.stroke();
          
          // Draw arrow head at the end (pointing towards anchor)
          const arrowLength = 15;
          const arrowAngle = Math.PI / 6; // 30 degrees
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(
              endX - arrowLength * Math.cos(reverseAngle - arrowAngle),
              endY - arrowLength * Math.sin(reverseAngle - arrowAngle)
          );
          ctx.moveTo(endX, endY);
          ctx.lineTo(
              endX - arrowLength * Math.cos(reverseAngle + arrowAngle),
              endY - arrowLength * Math.sin(reverseAngle + arrowAngle)
          );
          ctx.strokeStyle = trajectoryColor;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.stroke();
          
          ctx.restore();
      }

      // Laser Sight (AI recommendation)
      const currentAimTarget = aimTargetRef.current;
      const thinking = isAiThinkingRef.current;
      const currentNextColor = nextShotColorRef.current;
      const shouldShowLine = currentAimTarget && !isFlying.current && !isPinching.current;

      if (shouldShowLine || thinking) {
          ctx.save();
          const highlightColor = thinking ? '#a8c7fa' : COLOR_CONFIG[currentNextColor].hex; 
          
          ctx.shadowBlur = 15;
          ctx.shadowColor = highlightColor;
          
          ctx.beginPath();
          ctx.moveTo(anchorPos.current.x, anchorPos.current.y);
          if (currentAimTarget) {
            ctx.lineTo(currentAimTarget.x, currentAimTarget.y);
          } else {
            ctx.lineTo(anchorPos.current.x, anchorPos.current.y - 200);
          }
          
          const time = performance.now();
          const dashOffset = (time / 15) % 30;
          ctx.setLineDash([20, 15]);
          ctx.lineDashOffset = -dashOffset;
          
          ctx.strokeStyle = thinking ? 'rgba(168, 199, 250, 0.5)' : highlightColor;
          ctx.lineWidth = 4;
          ctx.stroke();
          
          if (currentAimTarget && !thinking) {
              ctx.beginPath();
              ctx.arc(currentAimTarget.x, currentAimTarget.y, BUBBLE_RADIUS, 0, Math.PI * 2);
              ctx.setLineDash([5, 5]);
              ctx.strokeStyle = highlightColor;
              ctx.fillStyle = 'rgba(255,255,255,0.1)';
              ctx.fill();
              ctx.stroke();
          }
          
          ctx.restore();
      }
      
      // Removed Canvas "ANALYZING..." drawing code from here

      // Slingshot Band (Back)
      const bandColor = isPinching.current ? '#fdd835' : 'rgba(255,255,255,0.4)';
      if (!isFlying.current) {
        ctx.beginPath();
        ctx.moveTo(anchorPos.current.x - 35, anchorPos.current.y - 10);
        ctx.lineTo(ballPos.current.x, ballPos.current.y);
        ctx.lineWidth = 5;
        ctx.strokeStyle = bandColor;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Draw Slingshot Ball (Projectile)
      // Show the random color that will be shot next
      // If locked, we draw it slightly faded to indicate inactivity
      ctx.save();
      if (isLocked && !isFlying.current) {
          ctx.globalAlpha = 0.5;
      }
      drawBubble(ctx, ballPos.current.x, ballPos.current.y, BUBBLE_RADIUS, nextShotColorRef.current);
      ctx.restore();

      // Slingshot Band (Front)
      if (!isFlying.current) {
        ctx.beginPath();
        ctx.moveTo(ballPos.current.x, ballPos.current.y);
        ctx.lineTo(anchorPos.current.x + 35, anchorPos.current.y - 10);
        ctx.lineWidth = 5;
        ctx.strokeStyle = bandColor;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Slingshot Handle
      ctx.beginPath();
      ctx.moveTo(anchorPos.current.x, canvas.height); 
      ctx.lineTo(anchorPos.current.x, anchorPos.current.y + 40); 
      ctx.lineTo(anchorPos.current.x - 40, anchorPos.current.y); 
      ctx.moveTo(anchorPos.current.x, anchorPos.current.y + 40);
      ctx.lineTo(anchorPos.current.x + 40, anchorPos.current.y); 
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#616161';
      ctx.stroke();

      // Particles
      for (let i = particles.current.length - 1; i >= 0; i--) {
          const p = particles.current[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.05;
          if (p.life <= 0) particles.current.splice(i, 1);
          else {
              ctx.globalAlpha = p.life;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
              ctx.fillStyle = p.color;
              ctx.fill();
              ctx.globalAlpha = 1.0;
          }
      }
      
      ctx.restore();

      // --- CAPTURE SCREENSHOT IF REQUESTED ---
      // We do this at the end of the render loop to ensure everything is drawn
      if (captureRequestRef.current) {
        captureRequestRef.current = false;
        
        // --- OPTIMIZATION: Resize & Compress Image before sending ---
        const offscreen = document.createElement('canvas');
        const targetWidth = 480; // Small width is sufficient for color/layout analysis
        const scale = Math.min(1, targetWidth / canvas.width);
        
        offscreen.width = canvas.width * scale;
        offscreen.height = canvas.height * scale;
        
        const oCtx = offscreen.getContext('2d');
        if (oCtx) {
            oCtx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
            // Use JPEG at 0.6 quality for faster upload/processing
            const screenshot = offscreen.toDataURL("image/jpeg", 0.6);
            
            // Send to AI (non-blocking for render loop, but locks game logic)
            setTimeout(() => performAiAnalysis(screenshot), 0);
        }
      }
    };

    if (window.Hands) {
      hands = new window.Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      hands.onResults(onResults);
      if (window.Camera) {
        camera = new window.Camera(video, {
          onFrame: async () => {
            if (videoRef.current && hands) await hands.send({ image: videoRef.current });
          },
          width: 1280,
          height: 720,
        });
        camera.start();
      }
    }

    return () => {
        if (camera) camera.stop();
        if (hands) hands.close();
    };
  }, [initGrid]);

  const recColorConfig = aiRecommendedColor ? COLOR_CONFIG[aiRecommendedColor] : null;
  const borderColor = recColorConfig ? recColorConfig.hex : '#444746';

  return (
    <div className="flex w-full h-screen bg-[#121212] overflow-hidden font-roboto text-[#e3e3e3]">
      
      {/* MOBILE/TABLET BLOCKER OVERLAY */}
      <div className="fixed inset-0 z-[100] bg-[#121212] flex flex-col items-center justify-center p-8 text-center hidden">
         <Monitor className="w-16 h-16 text-[#ef5350] mb-6 animate-pulse" />
         <h2 className="text-2xl font-bold text-[#e3e3e3] mb-4">Desktop View Required</h2>
         <p className="text-[#c4c7c5] max-w-md text-lg leading-relaxed">
           This experience requires a larger screen for the webcam tracking and game mechanics.
         </p>
         <div className="mt-8 flex items-center gap-2 text-sm text-[#757575] uppercase tracking-wider font-bold">
           <div className="w-2 h-2 bg-[#42a5f5] rounded-full"></div>
           Please maximize window
         </div>
      </div>

      {/* LEFT: Game Area */}
      <div ref={gameContainerRef} className="flex-1 relative h-full overflow-hidden">
        <video ref={videoRef} className="absolute hidden" playsInline />
        <canvas ref={canvasRef} className="absolute inset-0" />

        {/* Loading Overlay */}
        {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#121212] z-50">
            <div className="flex flex-col items-center">
                <Loader2 className="w-12 h-12 text-[#42a5f5] animate-spin mb-4" />
                <p className="text-[#e3e3e3] text-lg font-medium">Starting Engine...</p>
            </div>
            </div>
        )}

        {/* Analyzing Overlay - positioned at Slingshot Anchor */}
        {isAiThinking && (
          <div 
            className="absolute left-1/2 -translate-x-1/2 z-50 flex flex-col items-center justify-center pointer-events-none"
            style={{ bottom: '220px', transform: 'translate(-50%, 50%)' }}
          >
             <div className="w-[72px] h-[72px] rounded-full border-4 border-t-[#a8c7fa] border-r-[#a8c7fa] border-b-transparent border-l-transparent animate-spin" />
             <p className="mt-4 text-[#a8c7fa] font-bold text-xs tracking-widest animate-pulse">ANALYZING...</p>
          </div>
        )}

        {/* HUD: Score Card */}
        <div className="absolute top-6 left-6 z-40">
            <div className="bg-[#1e1e1e] p-5 rounded-[28px] border border-[#444746] shadow-2xl flex items-center gap-4 min-w-[180px]">
                <div className="bg-[#42a5f5]/20 p-3 rounded-full">
                    <Trophy className="w-6 h-6 text-[#42a5f5]" />
                </div>
                <div>
                    <p className="text-xs text-[#c4c7c5] uppercase tracking-wider font-medium">Score</p>
                    <p className="text-3xl font-bold text-white">{score.toLocaleString()}</p>
                </div>
            </div>
        </div>

        {/* HUD: Next Shot Color Display */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40">
            <div className="bg-[#1e1e1e] px-6 py-4 rounded-[32px] border border-[#444746] shadow-2xl flex items-center gap-4">
                <p className="text-xs text-[#c4c7c5] uppercase font-bold tracking-wider mr-2">Next Shot:</p>
                {(() => {
                    const config = COLOR_CONFIG[nextShotColor];
                    return (
                        <div className="relative w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
                            style={{ 
                                background: `radial-gradient(circle at 35% 35%, ${config.hex}, ${adjustColor(config.hex, -60)})`,
                                boxShadow: `0 0 25px ${config.hex}, inset 0 -4px 4px rgba(0,0,0,0.3)`
                            }}
                        >
                            {/* Glossy highlight */}
                            <div className="absolute top-2 left-3 w-4 h-2 bg-white/40 rounded-full transform -rotate-45 filter blur-[1px]" />
                            <span className="text-xs font-bold text-white drop-shadow-lg">
                                {config.label.charAt(0)}
                            </span>
                        </div>
                    );
                })()}
            </div>
        </div>

        {/* Bottom Tip */}
        {!isPinching.current && !isFlying.current && !isAiThinking && !gameOver && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none opacity-50">
                <div className="flex items-center gap-2 bg-[#1e1e1e]/90 px-4 py-2 rounded-full border border-[#444746] backdrop-blur-sm">
                    <Play className="w-3 h-3 text-[#42a5f5] fill-current" />
                    <p className="text-[#e3e3e3] text-xs font-medium">Pinch & Pull to Shoot</p>
                </div>
            </div>
        )}

        {/* Game Over Overlay */}
        {gameOver && (
            <div className="absolute inset-0 z-[60] bg-black/80 flex flex-col items-center justify-center">
                <div className="bg-[#1e1e1e] p-8 rounded-[32px] border-2 border-[#ef5350] shadow-2xl max-w-md w-full mx-4">
                    <div className="flex flex-col items-center gap-6">
                        <AlertTriangle className="w-16 h-16 text-[#ef5350] animate-pulse" />
                        <div className="text-center">
                            <h2 className="text-3xl font-bold text-white mb-2">Game Over!</h2>
                            <p className="text-[#c4c7c5] text-lg mb-4">Final Score: {score.toLocaleString()}</p>
                            <p className="text-[#757575] text-sm mb-6">
                                Bubbles reached the danger zone!
                            </p>
                        </div>
                        <button
                            onClick={restartGame}
                            className="flex items-center gap-3 bg-[#42a5f5] hover:bg-[#42a5f5]/90 text-white font-bold py-4 px-8 rounded-full transition-all duration-300 transform hover:scale-105 shadow-lg"
                        >
                            <RotateCcw className="w-5 h-5" />
                            <span>Restart Game</span>
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* RIGHT: Debug Panel */}
      <div className="w-[380px] bg-[#1e1e1e] border-l border-[#444746] flex flex-col h-full overflow-hidden shadow-2xl">
        
        {/* FLASH STRATEGY SECTION - PROMINENT */}
        <div 
            className="p-5 border-b-4 transition-colors duration-500 flex flex-col gap-2"
            style={{ 
                backgroundColor: '#252525',
                borderColor: borderColor
            }}
        >
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5" style={{ color: borderColor }} />
                    <h2 className="font-bold text-sm tracking-widest uppercase" style={{ color: borderColor }}>
                        Flash Strategy
                    </h2>
                </div>
                {isAiThinking && <Loader2 className="w-4 h-4 animate-spin text-white/50" />}
             </div>
             
             <p className="text-[#e3e3e3] text-sm leading-relaxed font-bold">
                {aiHint}
             </p>
             
             {aiRationale && (
                 <div className="flex gap-2 mt-1">
                     <Lightbulb className="w-4 h-4 text-[#a8c7fa] shrink-0 mt-0.5" />
                     <p className="text-[#a8c7fa] text-xs italic opacity-90 leading-tight">
                        {aiRationale}
                     </p>
                 </div>
             )}
             
             {aiRecommendedColor && (
                <div className="flex items-center gap-2 mt-3 bg-black/20 p-2 rounded">
                    <Target className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Rec. Color:</span>
                    <span className="text-xs font-bold uppercase" style={{ color: COLOR_CONFIG[aiRecommendedColor].hex }}>
                        {COLOR_CONFIG[aiRecommendedColor].label}
                    </span>
                </div>
             )}
        </div>

        {/* DEBUG HEADER */}
        <div className="p-3 border-b border-[#444746] bg-[#1e1e1e] flex items-center gap-2 text-[#757575]">
            <Terminal className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Debugger</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            
            {/* Status Section */}
            <div>
                <div className="flex items-center gap-2 mb-2 text-[#c4c7c5] text-xs font-bold uppercase tracking-wider">
                    <BrainCircuit className="w-3 h-3" /> Status
                </div>
                <div className={`p-3 rounded-lg border ${isAiThinking ? 'bg-[#a8c7fa]/10 border-[#a8c7fa]/30 text-[#a8c7fa]' : 'bg-[#444746]/20 border-[#444746]/50 text-[#c4c7c5]'}`}>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isAiThinking ? 'bg-[#a8c7fa] animate-pulse' : 'bg-[#66bb6a]'}`} />
                        <span className="text-sm font-mono">{isAiThinking ? 'Processing Vision...' : 'Waiting for Input'}</span>
                    </div>
                </div>
            </div>

            {/* Vision Input */}
            {debugInfo?.screenshotBase64 && (
                <div>
                    <div className="flex items-center gap-2 mb-2 text-[#c4c7c5] text-xs font-bold uppercase tracking-wider">
                        <Eye className="w-3 h-3" /> Vision Input
                    </div>
                    <div className="rounded-lg overflow-hidden border border-[#444746] bg-black/50 relative group">
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={debugInfo.screenshotBase64} alt="AI Vision" className="w-full h-auto opacity-80 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1 text-[10px] text-center text-gray-400 font-mono">
                            Sent to gemini-3-flash
                        </div>
                    </div>
                </div>
            )}

            {/* Prompt Context */}
            {debugInfo?.promptContext && (
                <div>
                    <div className="flex items-center gap-2 mb-2 text-[#c4c7c5] text-xs font-bold uppercase tracking-wider">
                        <Terminal className="w-3 h-3" /> Prompt Context
                    </div>
                    <div className="bg-[#121212] p-3 rounded-lg border border-[#444746] font-mono text-[10px] text-gray-400 h-32 overflow-y-auto whitespace-pre-wrap leading-tight">
                        {debugInfo.promptContext}
                    </div>
                </div>
            )}

            {/* AI Output Stats */}
            {debugInfo && (
                <div>
                    <div className="flex items-center gap-2 mb-2 text-[#c4c7c5] text-xs font-bold uppercase tracking-wider">
                        <BrainCircuit className="w-3 h-3" /> AI Output
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mb-3">
                         <div className="bg-[#2a2a2a] p-2 rounded border border-[#444746]">
                            <p className="text-[10px] text-gray-500 mb-1">Latency</p>
                            <div className="flex items-center gap-1 text-[#a8c7fa] font-mono font-bold">
                                {debugInfo.latency}ms
                            </div>
                         </div>
                         <div className="bg-[#2a2a2a] p-2 rounded border border-[#444746]">
                            <p className="text-[10px] text-gray-500 mb-1">Rec. Color</p>
                            <div className="flex items-center gap-1 text-[#e3e3e3] font-mono font-bold capitalize">
                                {debugInfo.parsedResponse?.recommendedColor || '--'}
                            </div>
                         </div>
                    </div>

                    {debugInfo.error && (
                         <div className="bg-[#ef5350]/10 border border-[#ef5350]/30 p-3 rounded-lg mb-3">
                            <div className="flex items-start gap-2 text-[#ef5350]">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs font-bold">PARSE ERROR DETAILS</p>
                                    <p className="text-[10px] font-mono mt-1 break-all">{debugInfo.error}</p>
                                </div>
                            </div>
                         </div>
                    )}

                    <p className="text-[10px] text-gray-500 mb-1">Raw Response Text</p>
                    <div className="bg-[#121212] p-3 rounded-lg border border-[#444746] font-mono text-[11px] text-[#66bb6a] max-h-40 overflow-y-auto whitespace-pre-wrap mb-3 border-l-2 border-l-[#66bb6a]">
                        {debugInfo.rawResponse}
                    </div>

                    <p className="text-[10px] text-gray-500 mb-1">Parsed JSON</p>
                    <div className="bg-[#121212] p-3 rounded-lg border border-[#444746] font-mono text-[10px] text-[#a8c7fa] overflow-x-auto">
                        <pre>{JSON.stringify(debugInfo.parsedResponse || { error: "Failed to parse" }, null, 2)}</pre>
                    </div>
                </div>
            )}
        </div>
        
        <div className="p-3 bg-[#252525] border-t border-[#444746] text-center">
            <p className="text-[10px] text-gray-500 font-medium"> </p>
        </div>
      </div>
    </div>
  );
};

export default GeminiSlingshot;
