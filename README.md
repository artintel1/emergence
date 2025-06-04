# Particle Lenia 3D Simulation

This project implements a 3D version of a Particle Lenia system, visualized using Three.js.
The core Lenia logic is based on a Python implementation found in the `thisis-elina/particle-lenia-thesis` GitHub repository, which itself was inspired by `@znah`'s ObservableHQ model.

## How to Run

1.  Ensure you have a modern web browser that supports WebGL and ES6 modules.
2.  Clone or download this repository.
3.  Open the `index.html` file in your web browser.
    *   An internet connection is required to load Three.js from the CDN.

## Features

*   **3D Particle Simulation:** Particles interact in a 3D space.
*   **Lenia Dynamics:** Implements core Lenia mechanics:
    *   A kernel function (K) defining local attraction/potential.
    *   A growth function (G) that maps accumulated potential to a growth signal.
    *   Repulsion forces at very short distances.
*   **Three.js Visualization:** Particles are rendered as spheres.
*   **Basic UI Controls:**
    *   **Pause/Resume:** Start or stop the simulation.
    *   **Reset:** Re-initialize particles to new random positions.

## Implemented Parameters

The simulation uses parameters adapted from the reference Python script. These are currently hardcoded in `main.js` within the `config` object:

*   `particleCount`: Number of particles.
*   `worldSize`: Defines the cubic boundary for periodic wrapping.
*   `initialSpread`: How spread out particles are at initialization.
*   `particleRenderSize`: Visual size of the particle spheres.
*   `leniaParams`:
    *   `mu_k`, `sigma_k`, `w_k`: Parameters for the primary kernel function (K).
    *   `mu_g`, `sigma_g`: Parameters for the growth mapping function (G).
    *   `c_rep`: Strength of the short-range repulsion.
    *   `dt`: Time step for the simulation integration.
    *   `steps_per_frame`: Number of simulation steps calculated per rendered animation frame.
*   `damping`: A factor to dampen particle velocities each step, aiding stability.

## Code Structure

*   `index.html`: The main HTML file, sets up the canvas and UI buttons.
*   `style.css`: Basic styling for the page and UI elements.
*   `main.js`: Contains all the JavaScript code:
    *   Three.js scene setup.
    *   Particle class definition.
    *   Lenia simulation logic (field computation, particle updates).
    *   Particle visualization.
    *   UI event handlers.

## Potential Future Enhancements

*   More UI controls for Lenia parameters.
*   Different rendering styles for particles.
*   Camera controls (e.g., OrbitControls).
*   Performance optimizations for a very large number of particles.
