import * as THREE from '../node_modules/three/build/three.module.js';

// High-performance 3D Knowledge Graph for Jarvis HUD
export class Graph3D {
  constructor(container) {
    this.container = container;
    this.orbitSpeed = 0.6;
    this.linkDistance = 1.0;
    this.level = 0;
    this.smoothLevel = 0;
    this.state = 'idle';
    this.targetRotation = { x: 0.2, y: 0 };
    this.currentRotation = { x: 0.2, y: 0 };
    this.cameraDistance = 480;
    this.targetDistance = 480;
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };

    this.init();
    this.createGraph();
    this.setupEvents();
    this.animate();
  }

  init() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020713, 0.0012);

    this.camera = new THREE.PerspectiveCamera(55, w / h, 1, 3000);
    this.camera.position.set(0, 50, this.cameraDistance);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    // Ambient and point lights for subtle depth
    const ambient = new THREE.AmbientLight(0x224477, 1.2);
    this.scene.add(ambient);

    const point = new THREE.PointLight(0x3aa9ff, 2.5, 1200);
    point.position.set(0, 100, 200);
    this.scene.add(point);

    this.graphGroup = new THREE.Group();
    this.scene.add(this.graphGroup);
  }

  createGraph() {
    // Clusters inspired by Iron Man / Jarvis Knowledge Matrix
    const clusters = [
      { name: 'Core Intelligence', color: 0x38bdf8, count: 95, center: new THREE.Vector3(0, 0, 0), radius: 90 },
      { name: 'Automations', color: 0x4ade80, count: 70, center: new THREE.Vector3(140, 60, -60), radius: 75 },
      { name: 'Neural Memory', color: 0xc084fc, count: 85, center: new THREE.Vector3(-150, 40, -40), radius: 80 },
      { name: 'Web & Research', color: 0xfacc15, count: 65, center: new THREE.Vector3(80, -90, 80), radius: 70 },
      { name: 'Security Failsafes', color: 0xf87171, count: 40, center: new THREE.Vector3(-120, -80, 50), radius: 60 },
      { name: 'Devices & Media', color: 0xfb923c, count: 55, center: new THREE.Vector3(0, 130, 40), radius: 65 },
    ];

    this.nodes = [];
    this.clusters = clusters;

    // Generate nodes
    clusters.forEach((cluster, cIdx) => {
      for (let i = 0; i < cluster.count; i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = Math.cbrt(Math.random()) * cluster.radius;
        const sinPhi = Math.sin(phi);

        const x = cluster.center.x + r * sinPhi * Math.cos(theta);
        const y = cluster.center.y + r * sinPhi * Math.sin(theta);
        const z = cluster.center.z + r * Math.cos(phi);

        this.nodes.push({
          pos: new THREE.Vector3(x, y, z),
          basePos: new THREE.Vector3(x, y, z),
          color: cluster.color,
          clusterIndex: cIdx,
          scale: 0.8 + Math.random() * 0.9,
          pulseSpeed: 0.8 + Math.random() * 1.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    });

    const totalNodes = this.nodes.length;

    // Create InstancedMesh for maximum 60FPS performance
    const geom = new THREE.SphereGeometry(2.6, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.instancedMesh = new THREE.InstancedMesh(geom, mat, totalNodes);

    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();

    this.nodes.forEach((node, i) => {
      dummy.position.copy(node.pos);
      dummy.scale.setScalar(node.scale);
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, dummy.matrix);
      tempColor.setHex(node.color);
      this.instancedMesh.setColorAt(i, tempColor);
    });

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
    this.graphGroup.add(this.instancedMesh);

    // Generate links (intra-cluster + some cross-cluster bridges)
    const linePositions = [];
    const lineColors = [];
    const maxLinksPerNode = 4;
    const c1 = new THREE.Color();
    const c2 = new THREE.Color();

    for (let i = 0; i < totalNodes; i++) {
      let connections = 0;
      for (let j = i + 1; j < totalNodes; j++) {
        if (connections >= maxLinksPerNode) break;
        const d = this.nodes[i].pos.distanceTo(this.nodes[j].pos);
        const sameCluster = this.nodes[i].clusterIndex === this.nodes[j].clusterIndex;
        const threshold = sameCluster ? 38 : 22;

        if (d < threshold) {
          linePositions.push(
            this.nodes[i].pos.x, this.nodes[i].pos.y, this.nodes[i].pos.z,
            this.nodes[j].pos.x, this.nodes[j].pos.y, this.nodes[j].pos.z
          );
          c1.setHex(this.nodes[i].color);
          c2.setHex(this.nodes[j].color);
          lineColors.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
          connections++;
        }
      }
    }

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeom.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
    });

    this.lineMesh = new THREE.LineSegments(lineGeom, lineMat);
    this.graphGroup.add(this.lineMesh);

    // Background cosmic particle grid
    const partCount = 450;
    const partGeom = new THREE.BufferGeometry();
    const partPos = [];
    for (let i = 0; i < partCount; i++) {
      partPos.push(
        (Math.random() - 0.5) * 1600,
        (Math.random() - 0.5) * 1200,
        (Math.random() - 0.5) * 1600
      );
    }
    partGeom.setAttribute('position', new THREE.Float32BufferAttribute(partPos, 3));
    const partMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 2.2,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(partGeom, partMat);
    this.scene.add(this.dust);
  }

  setupEvents() {
    window.addEventListener('resize', () => this.onResize());

    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.prevMouse.x = e.clientX;
      this.prevMouse.y = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.targetRotation.y += dx * 0.005;
      this.targetRotation.x += dy * 0.005;
      this.targetRotation.x = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, this.targetRotation.x));
      this.prevMouse.x = e.clientX;
      this.prevMouse.y = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    dom.addEventListener('wheel', (e) => {
      this.targetDistance += e.deltaY * 0.4;
      this.targetDistance = Math.max(220, Math.min(950, this.targetDistance));
    }, { passive: true });
  }

  onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setLevel(lvl) {
    this.level = lvl;
  }

  setState(st) {
    this.state = st;
  }

  focusCluster(idx) {
    if (!this.clusters[idx]) return;
    const center = this.clusters[idx].center;
    // Animate camera rotation towards cluster
    const angleY = -Math.atan2(center.x, center.z);
    this.targetRotation.y = angleY;
    this.targetRotation.x = 0.1;
    this.targetDistance = 320;
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.smoothLevel += (this.level - this.smoothLevel) * 0.2;
    const time = performance.now() * 0.001;

    // Automatic slow orbit unless dragging
    if (!this.isDragging) {
      let speedMult = this.orbitSpeed;
      if (this.state === 'speaking') speedMult *= 1.8;
      else if (this.state === 'thinking') speedMult *= 2.4;
      this.targetRotation.y += 0.0018 * speedMult;
    }

    // Smooth camera damping
    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.06;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.06;
    this.cameraDistance += (this.targetDistance - this.cameraDistance) * 0.08;

    this.graphGroup.rotation.x = this.currentRotation.x;
    this.graphGroup.rotation.y = this.currentRotation.y;
    this.camera.position.z = this.cameraDistance;

    // Dust subtle drift
    if (this.dust) this.dust.rotation.y = time * 0.02;

    // Reactively pulse nodes when voice audio is active
    if (this.instancedMesh) {
      const dummy = new THREE.Object3D();
      const audioBoost = this.smoothLevel * 1.6;

      // Update a sample of nodes for audio reactivity without burning CPU
      const step = 2;
      for (let i = 0; i < this.nodes.length; i += step) {
        const node = this.nodes[i];
        const pulse = Math.sin(time * node.pulseSpeed * 3 + node.phase);
        const s = node.scale * (1 + pulse * 0.18 + audioBoost * 0.85);

        dummy.position.copy(node.pos);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, dummy.matrix);
      }
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    // Dynamic line opacity reacting to voice
    if (this.lineMesh) {
      const baseOp = 0.24;
      const boost = this.smoothLevel * 0.35 + (this.state === 'speaking' ? 0.12 : 0);
      this.lineMesh.material.opacity = baseOp + boost;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
