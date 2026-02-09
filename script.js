document.addEventListener('DOMContentLoaded', () => {
    // --- 1. 初始化與按鈕綁定 ---
    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('canvasContainer');
    const contextMenu = document.getElementById('contextMenu');
    const renameInput = document.getElementById('renameInput');

    // 綁定按鈕 (這裡會呼叫下面的函數)
    document.getElementById('btnPreview').onclick = generateJSON;
    document.getElementById('btnDownload').onclick = downloadJSON;
    document.getElementById('btnModalDownload').onclick = downloadJSONFromModal;
    document.getElementById('fileInput').onchange = (e) => importJSON(e.target);
    document.getElementById('btnClear').onclick = openConfirmModal; // 這裡現在找得到了！
    
    // 綁定視窗按鈕
    document.getElementById('btnCloseCodeModal').onclick = () => closeModal('codeModal');
    document.getElementById('btnCancelClear').onclick = () => closeModal('confirmModal');
    document.getElementById('btnConfirmClear').onclick = confirmClearCanvas;

    // --- 2. 變數與狀態 ---
    let nodes = []; 
    let edges = []; 
    
    let camera = { x: 0, y: 0, zoom: 1 };
    
    let selectedNode = null;
    let selectedEdge = null;
    let draggingNode = null;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    
    let isCreatingEdge = false;
    let dragStartNode = null;
    let mouseX = 0; 
    let mouseY = 0; 

    let contextMenuPos = { x: 0, y: 0 }; 

    let isRenaming = false;
    let renamingNode = null;

    // 常數設定
    const BASE_RADIUS = 25; 
    const PADDING_RADIUS = 15; 
    const THEME = {
        nodeFill: '#1e1e1e',
        nodeBorder: '#00e5ff',
        nodeText: '#ffffff',
        nodeSelected: '#ff0055',
        edge: '#666666',
        edgeSelected: '#ff0055',
        edgeArrow: '#00e5ff',
        grid: 'rgba(0, 229, 255, 0.1)'
    };

    // --- 3. 核心功能 ---
    function resize() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        if (nodes.length === 0) {
            camera.x = canvas.width / 2;
            camera.y = canvas.height / 2;
        }
        draw();
    }
    window.addEventListener('resize', resize);
    setTimeout(resize, 100);

    // 座標轉換
    function screenToWorld(sx, sy) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (sx - rect.left - camera.x) / camera.zoom,
            y: (sy - rect.top - camera.y) / camera.zoom
        };
    }

    function worldToScreen(wx, wy) {
        return {
            x: (wx * camera.zoom) + camera.x,
            y: (wy * camera.zoom) + camera.y
        };
    }

    function calculateNodeRadius(name) {
        ctx.font = 'bold 14px Arial';
        const metrics = ctx.measureText(name);
        return Math.max(BASE_RADIUS, (metrics.width / 2) + PADDING_RADIUS);
    }

    // --- 4. 滑鼠與鍵盤事件 ---

    canvas.addEventListener('mousedown', e => {
        if(isRenaming) finishRenaming();
        hideContextMenu();
        if (e.button === 2) return;

        const pos = screenToWorld(e.clientX, e.clientY);
        const node = getNodeAt(pos.x, pos.y);
        const edge = getEdgeAt(pos.x, pos.y);

        // 平移畫布判定
        if (e.button === 1 || (e.button === 0 && !node && !edge && !e.shiftKey)) {
            isPanning = true;
            panStart = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            return;
        }

        // 左鍵點擊判定
        if (e.button === 0) {
            if (e.shiftKey && node) {
                isCreatingEdge = true;
                dragStartNode = node;
                selectedNode = null;
                selectedEdge = null;
            } else if (node) {
                draggingNode = node;
                selectedNode = node;
                selectedEdge = null;
            } else if (edge) {
                selectedEdge = edge;
                selectedNode = null;
            } else {
                selectedNode = null;
                selectedEdge = null;
            }
        }
        draw();
    });

    canvas.addEventListener('mousemove', e => {
        const pos = screenToWorld(e.clientX, e.clientY);
        mouseX = pos.x;
        mouseY = pos.y;

        if (isPanning) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            camera.x += dx;
            camera.y += dy;
            panStart = { x: e.clientX, y: e.clientY };
            draw();
            if(isRenaming) updateRenameInputPosition(); 
            return;
        }

        if (draggingNode) {
            draggingNode.x = pos.x;
            draggingNode.y = pos.y;
            draw();
            if(isRenaming && renamingNode === draggingNode) updateRenameInputPosition();
        } else if (isCreatingEdge) {
            draw();
        }
    });

    canvas.addEventListener('mouseup', e => {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'default';
            return;
        }

        const pos = screenToWorld(e.clientX, e.clientY);
        
        if (isCreatingEdge && dragStartNode) {
            const targetNode = getNodeAt(pos.x, pos.y);
            if (targetNode && targetNode !== dragStartNode) {
                createEdge(dragStartNode, targetNode);
            }
        } else if (selectedEdge && !draggingNode && !isCreatingEdge) {
             const edgeCheck = getEdgeAt(pos.x, pos.y);
             if (edgeCheck === selectedEdge) {
                 selectedEdge.type = selectedEdge.type === 'directed' ? 'bidirectional' : 'directed';
             }
        }

        isCreatingEdge = false;
        dragStartNode = null;
        draggingNode = null;
        draw();
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const delta = e.deltaY < 0 ? 1 : -1;
        const newZoom = camera.zoom + (delta * zoomIntensity);

        if (newZoom > 0.1 && newZoom < 5) {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const worldX = (mouseX - camera.x) / camera.zoom;
            const worldY = (mouseY - camera.y) / camera.zoom;

            camera.zoom = newZoom;
            camera.x = mouseX - worldX * camera.zoom;
            camera.y = mouseY - worldY * camera.zoom;
            
            draw();
            if(isRenaming) updateRenameInputPosition();
        }
    }, { passive: false });

    canvas.addEventListener('dblclick', e => {
        const pos = screenToWorld(e.clientX, e.clientY);
        const node = getNodeAt(pos.x, pos.y);
        if (node) {
            startRenaming(node);
        }
    });

    window.addEventListener('keydown', e => {
        if (isRenaming) {
            if (e.key === 'Enter') finishRenaming();
            if (e.key === 'Escape') cancelRenaming();
            return;
        }
        if (e.key === 'Delete') {
            if (selectedNode) deleteNode(selectedNode);
            else if (selectedEdge) {
                edges = edges.filter(e => e !== selectedEdge);
                selectedEdge = null;
                draw();
            }
        }
    });

    // --- 5. 右鍵選單 ---
    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        const pos = screenToWorld(e.clientX, e.clientY);
        const node = getNodeAt(pos.x, pos.y);
        
        contextMenuPos = pos; 
        
        buildContextMenu(node);
        contextMenu.style.display = 'block';
        contextMenu.style.left = e.clientX + 'px';
        contextMenu.style.top = e.clientY + 'px';
    });

    window.addEventListener('click', (e) => {
        if(e.target !== renameInput) hideContextMenu();
    });

    function buildContextMenu(targetNode) {
        contextMenu.innerHTML = '';
        if (targetNode) {
            addMenuItem("🔗 新增連線", () => startEdgeCreation(targetNode));
            addMenuSeparator();
            addMenuItem("✏️ 重新命名", () => startRenaming(targetNode));
            addMenuItem("🗑️ 刪除", () => deleteNode(targetNode));
        } else {
            addMenuItem("🔵 新增節點", () => spawnNode());
        }
    }

    function addMenuItem(text, onClick) {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.textContent = text;
        div.onclick = () => { onClick(); hideContextMenu(); };
        contextMenu.appendChild(div);
    }
    
    function addMenuSeparator() {
        const div = document.createElement('div');
        div.className = 'menu-separator';
        contextMenu.appendChild(div);
    }

    function hideContextMenu() { contextMenu.style.display = 'none'; }

    // --- 6. 重新命名功能 ---
    function startRenaming(node) {
        if (!node) return;
        isRenaming = true;
        renamingNode = node;
        renameInput.value = node.name;
        renameInput.style.display = 'block';
        updateRenameInputPosition();
        renameInput.focus();
        renameInput.select();
    }

    function updateRenameInputPosition() {
        if (!renamingNode) return;
        const screenPos = worldToScreen(renamingNode.x, renamingNode.y);
        renameInput.style.left = screenPos.x + 'px';
        renameInput.style.top = screenPos.y + 'px';
    }

    function finishRenaming() {
        if (!isRenaming || !renamingNode) return;
        const newName = renameInput.value.trim();
        if (newName) {
            renamingNode.name = newName;
            renamingNode.radius = calculateNodeRadius(newName);
        }
        cancelRenaming();
        draw();
    }

    function cancelRenaming() {
        isRenaming = false;
        renamingNode = null;
        renameInput.style.display = 'none';
        canvas.focus();
    }
    renameInput.addEventListener('blur', () => setTimeout(() => { if (isRenaming) finishRenaming(); }, 100));

    // --- 7. 圖形操作邏輯 ---
    function spawnNode() {
        const name = "State" + (nodes.length + 1);
        const r = calculateNodeRadius(name);
        const newNode = { id: Date.now(), x: contextMenuPos.x, y: contextMenuPos.y, name, radius: r };
        nodes.push(newNode);
        draw();
        setTimeout(() => startRenaming(newNode), 50);
    }

    function deleteNode(node) {
        edges = edges.filter(edge => edge.from !== node && edge.to !== node);
        nodes = nodes.filter(n => n !== node);
        selectedNode = null;
        draw();
    }

    function startEdgeCreation(node) {
        isCreatingEdge = true;
        dragStartNode = node;
    }

    function createEdge(n1, n2) {
        const existing = edges.find(e => 
            (e.from === n1 && e.to === n2) ||
            (e.from === n2 && e.to === n1)
        );
        if (!existing) {
            edges.push({ from: n1, to: n2, type: 'directed' });
        }
    }

    // --- 8. 繪圖引擎 ---
    function draw() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid();

        ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);

        edges.forEach(edge => {
            const isSelected = (edge === selectedEdge);
            ctx.strokeStyle = isSelected ? THEME.edgeSelected : THEME.edge;
            ctx.lineWidth = isSelected ? 3 : 2;
            drawArrow(edge.from, edge.to, edge.type === 'bidirectional', isSelected);
        });

        if (isCreatingEdge && dragStartNode) {
            ctx.strokeStyle = '#aaa';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(dragStartNode.x, dragStartNode.y);
            ctx.lineTo(mouseX, mouseY);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        nodes.forEach(node => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = THEME.nodeFill;
            ctx.fill();
            ctx.lineWidth = 2 / camera.zoom * camera.zoom; 
            ctx.strokeStyle = (node === selectedNode) ? THEME.nodeSelected : THEME.nodeBorder;
            ctx.stroke();
            
            ctx.fillStyle = THEME.nodeText;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.name, node.x, node.y);
        });
    }

    function drawGrid() {
        const gridSize = 40 * camera.zoom;
        const offsetX = camera.x % gridSize;
        const offsetY = camera.y % gridSize;

        ctx.beginPath();
        ctx.strokeStyle = THEME.grid;
        ctx.lineWidth = 1;

        for (let x = offsetX; x < canvas.width; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
        }
        for (let y = offsetY; y < canvas.height; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
        }
        ctx.stroke();
    }

    function drawArrow(fromNode, toNode, bidirectional, isSelected) {
        const headlen = 10;
        const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
        
        const startX = fromNode.x + fromNode.radius * Math.cos(angle);
        const startY = fromNode.y + fromNode.radius * Math.sin(angle);
        const endX = toNode.x - toNode.radius * Math.cos(angle);
        const endY = toNode.y - toNode.radius * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.fillStyle = isSelected ? THEME.edgeSelected : THEME.edgeArrow;

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.fill();

        if (bidirectional) {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + headlen * Math.cos(angle - Math.PI / 6), startY + headlen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(startX + headlen * Math.cos(angle + Math.PI / 6), startY + headlen * Math.sin(angle + Math.PI / 6));
            ctx.fill();
        }
    }

    // --- 9. 碰撞檢測 ---
    function getNodeAt(x, y) {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            if (Math.hypot(n.x - x, n.y - y) < n.radius) return n;
        }
        return null;
    }

    function getEdgeAt(x, y) {
        for (let edge of edges) {
            const dist = pointToLineDist(x, y, edge.from.x, edge.from.y, edge.to.x, edge.to.y);
            if (dist < 10) return edge;
        }
        return null;
    }

    function pointToLineDist(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq != 0) param = dot / len_sq;
        let xx, yy;
        if (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else { xx = x1 + param * C; yy = y1 + param * D; }
        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // --- 10. JSON 與 視窗控制 ---
    function generateJSON() {
        document.getElementById('codeOutput').value = JSON.stringify(buildJSONObj(), null, 2);
        document.getElementById('codeModal').style.display = 'flex';
    }

    function downloadJSON() {
        const json = document.getElementById('codeOutput').value || JSON.stringify(buildJSONObj(), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'graph_adj_list.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function downloadJSONFromModal() { downloadJSON(); }

    function buildJSONObj() {
        let adjList = {};
        [...nodes].sort((a,b)=>a.name.localeCompare(b.name)).forEach(node => {
            let neighbors = [];
            edges.forEach(edge => {
                if(edge.from === node) neighbors.push(edge.to.name);
                else if(edge.to === node && edge.type === 'bidirectional') neighbors.push(edge.from.name);
            });
            adjList[node.name] = [...new Set(neighbors)].sort();
        });
        return adjList;
    }

    function importJSON(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                parseAndDrawJSON(JSON.parse(e.target.result));
            } catch (err) { alert("Invalid JSON"); }
            input.value = '';
        };
        reader.readAsText(file);
    }

    function parseAndDrawJSON(data) {
        nodes = []; edges = [];
        const nodeSet = new Set();
        Object.keys(data).forEach(k => {
            nodeSet.add(k);
            if (Array.isArray(data[k])) data[k].forEach(n => nodeSet.add(n));
        });
        const allNodeNames = Array.from(nodeSet).sort();
        
        camera = { x: canvas.width/2, y: canvas.height/2, zoom: 1 };
        
        const layoutRadius = Math.min(canvas.width, canvas.height) * 0.3;
        const angleStep = (Math.PI * 2) / allNodeNames.length;

        allNodeNames.forEach((name, index) => {
            const angle = index * angleStep;
            nodes.push({
                id: name, name: name,
                x: layoutRadius * Math.cos(angle),
                y: layoutRadius * Math.sin(angle),
                radius: calculateNodeRadius(name)
            });
        });

        const nodeMap = {}; nodes.forEach(n => nodeMap[n.name] = n);
        const createdConnections = new Set();

        Object.keys(data).forEach(src => {
            const sourceNode = nodeMap[src];
            if (sourceNode && Array.isArray(data[src])) {
                data[src].forEach(tgt => {
                    const targetNode = nodeMap[tgt];
                    if (!targetNode) return;
                    const reverseExists = data[tgt] && data[tgt].includes(src);
                    const pairKey = [src, tgt].sort().join('-');
                    if (createdConnections.has(pairKey)) return;

                    edges.push({ from: sourceNode, to: targetNode, type: reverseExists ? 'bidirectional' : 'directed' });
                    if (reverseExists) createdConnections.add(pairKey);
                });
            }
        });
        draw();
    }

    // --- 11. 視窗控制函數 (從 window.xxx 改回一般 function) ---
    function openConfirmModal() {
        document.getElementById('confirmModal').style.display = 'flex';
    }

    function confirmClearCanvas() {
        nodes = [];
        edges = [];
        draw();
        closeModal('confirmModal');
    }

    function closeModal(id) {
        document.getElementById(id).style.display = 'none';
    }
});