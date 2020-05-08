var updateVert = require('./glsl/particle_update_vert.glsl');
var passThruFrag = require('./glsl/passthru_frag.glsl');
var renderFrag = require('./glsl/particle_render_frag.glsl');
var renderVert = require('./glsl/particle_render_vert.glsl');
import { mat4, vec3 } from "gl-matrix";
import { createCanvas, createOverlay, initShaderProgram,  randomRGdata, initialParticleData, init } from "./setup";
import './styles.css';
import FFImage from './images/rgperlin.png';

(function main() {
    var [canvas, gl] = createCanvas(window.innerWidth, window.innerHeight);
    var force_field_image = new Image();
    force_field_image.src = FFImage;
    force_field_image.onload = function(){
        var system1 =
            init(
                gl,
                [updateVert, passThruFrag],
                [renderVert, renderFrag],
                force_field_image,
                1000, /* number of particles */
                0.5, /* birth rate */
                1.01, 1.45, /* life range */
                // Math.PI/2.0 - 0.5, Math.PI/2.0 + 0.5,
                -Math.PI, Math.PI,
                -0.3, 0.3, /* speed range */
                [0.0, 0.0]
            ); /* gravity */

        var system2 =
            init(
                gl,
                [updateVert, passThruFrag],
                [renderVert, renderFrag],
                force_field_image,
                1000, /* number of particles */
                0.5, /* birth rate */
                1.01, 1.45, /* life range */
                // Math.PI/2.0 - 0.5, Math.PI/2.0 + 0.5,
                -Math.PI, Math.PI,
                -0.3, 0.3, /* speed range */
                [0.0, 0.0]
            ); /* gravity */

        /* Makes the particle system follow the mouse pointer */
        canvas.onmousemove = function(e) {
            const x = 2.0 * (e.pageX - this.offsetLeft)/this.width - 1.0;
            const y = -(2.0 * (e.pageY - this.offsetTop)/this.height - 1.0);
            system1.origin = [x, y];
            system2.origin = [-x, y];
        };
        canvas.onmouseup = function(e) {
            const x = 2.0 * (e.pageX - this.offsetLeft)/this.width - 1.0;
            const y = -(2.0 * (e.pageY - this.offsetTop)/this.height - 1.0);
        };

        function draw(now) {
            render(gl, [system1, system2], now);
            window.requestAnimationFrame(draw);
        }
        window.requestAnimationFrame(draw);
    }
})();


function render(gl, states, timestamp_millis) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for(let state of states){
        var num_part = state.born_particles;

        /* Calculate time delta. */
        var time_delta = 0.0;
        if (state.old_timestamp != 0) {
            time_delta = timestamp_millis - state.old_timestamp;
            if (time_delta > 500.0) {
                /* If delta is too high, pretend nothing happened.
                 *          Probably tab was in background or something. */
                time_delta = 0.0;
            }
        }

        /* Here's where birth rate parameter comes into play.
         *      We add to the number of active particles in the system
         *           based on birth rate and elapsed time. */
        if (state.born_particles < state.num_particles) {
            state.born_particles = Math.min(state.num_particles,
                Math.floor(state.born_particles + state.birth_rate * time_delta));
        }
        /* Set the previous update timestamp for calculating time delta in the
         *      next frame. */
        state.old_timestamp = timestamp_millis;

        gl.useProgram(state.particle_update_program);

        /* Most of the following is trivial setting of uniforms */
        gl.uniform1f(
            gl.getUniformLocation(state.particle_update_program, "u_TimeDelta"),
            time_delta / 1000.0);
        gl.uniform1f(
            gl.getUniformLocation(state.particle_update_program, "u_Time"),
            state.total_time / 1000.0);
        gl.uniform1f(
            gl.getUniformLocation(state.particle_update_program, "u_TotalTime"),
            state.total_time);
        gl.uniform2f(
            gl.getUniformLocation(state.particle_update_program, "u_Gravity"),
            state.gravity[0], state.gravity[1]);

        // PARTICLE SYSTEM SPECIFIC UNIFORMS --------------------------------------
        gl.uniform2f(
            gl.getUniformLocation(state.particle_update_program, "u_Origin"),
            state.origin[0],
            state.origin[1]);
        gl.uniform1f(
            gl.getUniformLocation(state.particle_update_program, "u_MinTheta"),
            state.min_theta);
        gl.uniform1f(
            gl.getUniformLocation(state.particle_update_program, "u_MaxTheta"),
            state.max_theta);
        gl.uniform1f(
            gl.getUniformLocation(state.particle_update_program, "u_MinSpeed"),
            state.min_speed);
        gl.uniform1f(
            gl.getUniformLocation(state.particle_update_program, "u_MaxSpeed"),
            state.max_speed);
        // ------------------------------------------------------------------------

        state.total_time += time_delta;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.rg_noise);
        gl.uniform1i(
            gl.getUniformLocation(state.particle_update_program, "u_RgNoise"),
            0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, state.force_field);
        gl.uniform1i(
            gl.getUniformLocation(state.particle_update_program, "u_ForceField"),
            1);


        /* Bind the "read" buffer - it contains the state of the particle system
         *     "as of now".*/
        gl.bindVertexArray(state.particle_sys_vaos[state.read]);

        /* Bind the "write" buffer as transform feedback - the varyings of the
         *      update shader will be written here. */
        gl.bindBufferBase(
            gl.TRANSFORM_FEEDBACK_BUFFER, 0, state.particle_sys_buffers[state.write]);

        /* Since we're not actually rendering anything when updating the particle
         *      state, disable rasterization.*/
        gl.enable(gl.RASTERIZER_DISCARD);

        /* Begin transform feedback! */
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, num_part);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);
        /* Don't forget to unbind the transform feedback buffer! */
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);

        /* Now, we draw the particle system. Note that we're actually
         *      drawing the data from the "read" buffer, not the "write" buffer
         *           that we've written the updated data to. */
        gl.bindVertexArray(state.particle_sys_vaos[state.read + 2]);
        gl.useProgram(state.particle_render_program);
        gl.drawArrays(gl.POINTS, 0, num_part);

        /* Finally, we swap read and write buffers. The updated state will be
         *      rendered on the next frame. */
        var tmp = state.read;
        state.read = state.write;
        state.write = tmp;
    }
}
