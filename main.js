// main.js - Refined and Commented

import * as THREE from 'three';

// --- Configuration Object ---
const config = {
    particleCount: 200,    // Number of particles
    worldSize: 25.0,       // Overall size of the simulation cube
    initialSpread: 12.0,   // Initial random spread of particles
    particleRenderSize: 0.1, // Visual size of particles (radius of spheres)
    leniaParams: {
        mu_k: 4.0,         // Peak position for kernel function K (attraction/grouping)
        sigma_k: 1.0,      // Spread/width for kernel function K
        w_k: 0.022,        // Weight/amplitude for kernel function K
        mu_g: 0.6,         // Peak position for growth function G
        sigma_g: 0.15,     // Spread/width for growth function G
        c_rep: 1.0,        // Repulsion strength
        dt: 0.1,           // Simulation time step
        steps_per_frame: 10 // Number of simulation steps per rendered frame
    },
    damping: 0.98          // Velocity damping factor per step
};

// --- Global Variables ---
let scene, camera, renderer;
let particles = [];
let isPaused = false;

// Shared geometry and material for particles for efficiency
const particleGeometry = new THREE.SphereGeometry(config.particleRenderSize, 16, 8);
const particleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff }); // White particles

// --- Particle Class ---
class Particle {
    constructor() {
        // Initialize position randomly within a cube defined by initialSpread
        this.position = new THREE.Vector3(
            (Math.random() - 0.5) * config.initialSpread,
            (Math.random() - 0.5) * config.initialSpread,
            (Math.random() - 0.5) * config.initialSpread
        );
        this.velocity = new THREE.Vector3(); // Initial velocity is zero

        // Field data associated with the particle, updated during simulation
        this.R_val = 0.0; // Accumulated repulsion value
        this.U_val = 0.0; // Accumulated potential value (from kernel K)
        this.R_grad = new THREE.Vector3(); // Gradient of repulsion field
        this.U_grad = new THREE.Vector3(); // Gradient of potential field (kernel K)

        this.mesh = null; // Holds the Three.js Mesh for visualization
    }
}

// --- Initialization Functions ---

/**
 * Sets up the basic Three.js scene, camera, renderer, and lighting.
 */
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Black background

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = config.worldSize / 1.5; // Adjust camera based on world size

    const canvas = document.getElementById('leniaCanvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft white light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1); // Position the light
    scene.add(directionalLight);
}

/**
 * Initializes or re-initializes the particles in the simulation.
 * Clears old particle meshes from the scene before creating new ones.
 */
function initParticles() {
    // Clear existing particle objects and their meshes from the scene
    if (scene) {
        for (let i = scene.children.length - 1; i >= 0; i--) {
            const obj = scene.children[i];
            if (obj.userData.isParticle) { // Check custom flag set during mesh creation
                scene.remove(obj);
                // Note: Geometries and materials are shared, so no need to dispose them here
            }
        }
    }
    particles = []; // Reset the particles array

    // Create new particles
    for (let i = 0; i < config.particleCount; i++) {
        const p = new Particle();

        p.mesh = new THREE.Mesh(particleGeometry, particleMaterial);
        p.mesh.position.copy(p.position);
        p.mesh.userData.isParticle = true; // Flag for easy identification

        particles.push(p);
        if (scene) {
             scene.add(p.mesh);
        }
    }
    console.log(`Initialized ${particles.length} particles and their meshes.`);
}

// --- Event Handlers ---

/**
 * Handles window resize events to update camera aspect ratio and renderer size.
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Lenia Math Helper Functions ---

/**
 * Fast exponential approximation (e^x).
 * Ported from the reference Python code. Math.exp(x) is more accurate.
 * @param {number} x - The exponent.
 * @returns {number} Approximation of e^x.
 */
function fastExp(x) {
    // Using (1 + x/N)^N approximation for e^x. Here N=32.
    let t = 1.0 + x / 32.0;
    t *= t; t *= t; t *= t; t *= t; t *= t; // t^32
    return t;
}

/**
 * Lenia kernel function (Gaussian-like peak).
 * Calculates the potential value and its derivative.
 * @param {number} r - Distance.
 * @param {number} mu - Peak position.
 * @param {number} sigma - Spread/width of the peak.
 * @param {number} [w=1.0] - Weight/amplitude of the peak.
 * @returns {[number, number]} Array containing [value, derivative].
 */
function peakFunction(r, mu, sigma, w = 1.0) {
    const t = (r - mu) / sigma;
    // Using fastExp as in the reference Python code.
    // For higher accuracy, Math.exp(-(t * t)) could be used.
    const y_val = w / fastExp(t * t);
    const deriv = -2.0 * t * y_val / sigma;
    return [y_val, deriv];
}

/**
 * Repulsion function. Calculates repulsion force and its derivative.
 * @param {number} r - Distance.
 * @param {number} c_rep - Repulsion strength parameter.
 * @returns {[number, number]} Array containing [repulsion_value, derivative].
 */
function repulsionFunction(r, c_rep) {
    const t = Math.max(1.0 - r, 0.0); // Repulsion is active for r < 1.0
    const val = 0.5 * c_rep * t * t;  // Quadratic repulsion
    const deriv = -c_rep * t;
    return [val, deriv];
}

// --- Simulation Core Logic ---

/**
 * Computes the interaction fields (repulsion and potential U) for all particles.
 * This involves iterating through all particle pairs.
 */
function computeFields() {
    const { mu_k, sigma_k, w_k, c_rep } = config.leniaParams;

    // Initialize/reset field values for all particles
    for (const p of particles) {
        // Set initial values based on self-interaction at distance zero
        // This is effectively adding the base value of the function at r=0 to itself
        p.R_val = repulsionFunction(0.0, c_rep)[0];
        p.U_val = peakFunction(0.0, mu_k, sigma_k, w_k)[0];
        p.R_grad.set(0, 0, 0); // Reset gradients
        p.U_grad.set(0, 0, 0);
    }

    // Calculate pairwise interactions
    for (let i = 0; i < config.particleCount; i++) {
        for (let j = i + 1; j < config.particleCount; j++) {
            const p1 = particles[i];
            const p2 = particles[j];

            // Vector difference and distance
            const diff = new THREE.Vector3().subVectors(p1.position, p2.position);
            const r = diff.length() + 1e-20; // Add epsilon to avoid division by zero

            // Optimization: skip distant particles if many particles (worldSize/2 is arbitrary)
            // This optimization is commented out as its effectiveness depends on parameters and particle distribution.
            // if (r > config.worldSize / 2 && config.particleCount > 100) continue;

            // Normalized direction vector from p2 to p1
            const norm_rx = diff.x / r;
            const norm_ry = diff.y / r;
            const norm_rz = diff.z / r;

            // Repulsion (active if r < 1.0)
            if (r < 1.0) {
                const [R, dR] = repulsionFunction(r, c_rep);
                // Add repulsion gradient component to p1
                p1.R_grad.x += norm_rx * dR;
                p1.R_grad.y += norm_ry * dR;
                p1.R_grad.z += norm_rz * dR;
                // Subtract repulsion gradient component from p2 (Newton's 3rd law)
                p2.R_grad.x -= norm_rx * dR;
                p2.R_grad.y -= norm_ry * dR;
                p2.R_grad.z -= norm_rz * dR;
                // Accumulate repulsion value (scalar field)
                p1.R_val += R;
                p2.R_val += R;
            }

            // Attraction/Potential Kernel (Lenia's K function)
            const [K, dK] = peakFunction(r, mu_k, sigma_k, w_k);
            // Add potential gradient component to p1
            p1.U_grad.x += norm_rx * dK;
            p1.U_grad.y += norm_ry * dK;
            p1.U_grad.z += norm_rz * dK;
            // Subtract potential gradient component from p2
            p2.U_grad.x -= norm_rx * dK;
            p2.U_grad.y -= norm_ry * dK;
            p2.U_grad.z -= norm_rz * dK;
            // Accumulate potential value (scalar field)
            p1.U_val += K;
            p2.U_val += K;
        }
    }
}

/**
 * Performs a single step of the Particle Lenia simulation.
 * Updates particle velocities and positions based on computed fields.
 */
function simulationStep() {
    const { mu_g, sigma_g, dt } = config.leniaParams;

    computeFields(); // Calculate all interaction fields first

    // Update velocities and positions for each particle
    for (const p of particles) {
        // Apply the "growth" function G to the particle's accumulated potential U_val
        // This is a key step in Lenia, transforming potential into a growth signal.
        const [G_val, dG_val] = peakFunction(p.U_val, mu_g, sigma_g); // w is 1.0 by default for G

        // Calculate force: F = dG * grad(U) - grad(R)
        // This is the effective force driving particle movement.
        const dG_U_grad = p.U_grad.clone().multiplyScalar(dG_val);
        const force = new THREE.Vector3().subVectors(dG_U_grad, p.R_grad);

        // Update velocity (F = ma, assuming m=1, so acceleration a = F)
        p.velocity.addScaledVector(force, dt); // v_new = v_old + F * dt

        // Apply velocity damping to stabilize the simulation
        p.velocity.multiplyScalar(config.damping);
    }

    // Update positions and handle boundary conditions
    for (const p of particles) {
        p.position.addScaledVector(p.velocity, dt); // p_new = p_old + v * dt

        // Simple periodic boundary conditions: if a particle exits one side, it re-enters from the opposite.
        const halfWorld = config.worldSize / 2;
        if (p.position.x < -halfWorld) p.position.x += config.worldSize;
        if (p.position.x >  halfWorld) p.position.x -= config.worldSize;
        if (p.position.y < -halfWorld) p.position.y += config.worldSize;
        if (p.position.y >  halfWorld) p.position.y -= config.worldSize;
        if (p.position.z < -halfWorld) p.position.z += config.worldSize;
        if (p.position.z >  halfWorld) p.position.z -= config.worldSize;
    }
}

// --- Animation Loop ---
/**
 * Main animation loop. Runs simulation steps and renders the scene.
 */
function animate() {
    requestAnimationFrame(animate); // Request the next frame

    if (!isPaused) {
        // Perform multiple simulation steps per rendered frame for smoother/faster simulation
        for (let i = 0; i < config.leniaParams.steps_per_frame; i++) {
            simulationStep();
        }

        // Update particle mesh positions to match their new simulated positions
        for (const p of particles) {
            if (p.mesh) {
                p.mesh.position.copy(p.position);
            }
        }
    }

    renderer.render(scene, camera); // Render the scene
}

// --- UI Handlers ---
/**
 * Handles the Start/Pause button click. Toggles the simulation state.
 */
function handleStartStop() {
    isPaused = !isPaused;
    const button = document.getElementById('startStopButton');
    if (button) {
        button.textContent = isPaused ? 'Resume' : 'Pause';
    }
    console.log(isPaused ? "Simulation Paused" : "Simulation Resumed");
}

/**
 * Handles the Reset button click. Re-initializes the simulation.
 */
function handleReset() {
    console.log("Resetting simulation...");
    isPaused = true; // Pause during reset
    // Update button text immediately to reflect action
    const button = document.getElementById('startStopButton');
    if (button) button.textContent = 'Resetting...';


    initParticles(); // Re-initialize particles (clears old ones, creates new ones)

    isPaused = false; // Resume after reset
    if (button) {
        button.textContent = 'Pause'; // Ensure button text is correct post-reset
    }
    console.log("Simulation Reset and Resumed.");
}

// --- Main Initialization ---
/**
 * Main function to initialize the application.
 */
function main() {
    // Check if Three.js is loaded (it should be, via importmap)
    if (typeof THREE === 'undefined') {
        console.error('Three.js has not been loaded. Ensure an internet connection for CDN or local setup.');
        document.body.innerHTML = '<div style="color: red; text-align: center; margin-top: 50px;">Error: Could not load Three.js. Please check console.</div>';
        return;
    }

    initScene();      // Set up the Three.js scene
    initParticles();  // Create the initial set of particles

    // Event listeners for UI
    window.addEventListener('resize', onWindowResize, false);
    const startStopButton = document.getElementById('startStopButton');
    if (startStopButton) {
        startStopButton.addEventListener('click', handleStartStop);
    }
    const resetButton = document.getElementById('resetButton');
    if (resetButton) {
        resetButton.addEventListener('click', handleReset);
    }

    // Set initial UI state for the start/stop button
    const ssb = document.getElementById('startStopButton');
    if (ssb) ssb.textContent = isPaused ? 'Resume' : 'Pause';

    animate(); // Start the animation loop
}

main(); // Run the application
