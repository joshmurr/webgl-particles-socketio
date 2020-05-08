import { createCanvas, createOverlay, initShaderProgram,  randomRGdata, initialParticleData, init, generateUID } from "./setup";
import socketIOClient from 'socket.io-client';
import './styles.css';
import FFImage from './images/rgperlin.png';
var updateVert = require('./glsl/particle_update_vert.glsl');
var passThruFrag = require('./glsl/passthru_frag.glsl');
var renderFrag = require('./glsl/particle_render_frag.glsl');
var renderVert = require('./glsl/particle_render_vert.glsl');

var particleSystems = {};
let newUser = false;
var socket = null;

window.onload = function main() {
    var [canvas, gl] = createCanvas(window.innerWidth, window.innerHeight);
    var force_field_image = new Image();
    force_field_image.src = FFImage;

    const UID = localStorage.getItem('UID') ? localStorage.getItem('UID') : generateUID();
    // const UID = generateUID();
    initUserSocket(UID);

    force_field_image.onload = function(){
        var userSystem = generateParticleSystem(gl, force_field_image);

        particleSystems[UID] = userSystem;

        /* Makes the particle system follow the mouse pointer */
        canvas.onmousemove = function(e) {
            const x = 2.0 * (e.pageX - this.offsetLeft)/this.width - 1.0;
            const y = -(2.0 * (e.pageY - this.offsetTop)/this.height - 1.0);
            particleSystems[UID].origin = [x, y];
            socket.emit('updateParticleSystem', {
                uid: UID,
                location: [x,y],
            });
        };

        function draw(now) {
            socket.on('updateUsersList', function(users) {
                newUser = true;
                if(newUser){
                    for(const user of users){
                        particleSystems[user] = particleSystems[user] ? particleSystems[user] : generateParticleSystem(gl, force_field_image);
                    }
                }
                newUser = false;
            });
            socket.on('newLocations', function(data) {
                if(data.uid !== UID && particleSystems[data.uid]){
                    particleSystems[data.uid].origin = data.location;
                }
            });
            render(gl, particleSystems, now);
            window.requestAnimationFrame(draw);
        }
        window.requestAnimationFrame(draw);
    }
};


function render(gl, particleSystems, timestamp_millis) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for(let ps in particleSystems){
        const particleSystem = particleSystems[ps];
        var num_part = particleSystem.born_particles;

        /* Calculate time delta. */
        var time_delta = 0.0;
        if (particleSystem.old_timestamp != 0) {
            time_delta = timestamp_millis - particleSystem.old_timestamp;
            if (time_delta > 500.0) {
                /* If delta is too high, pretend nothing happened.
                 *          Probably tab was in background or something. */
                time_delta = 0.0;
            }
        }

        /* Here's where birth rate parameter comes into play.
         *      We add to the number of active particles in the system
         *           based on birth rate and elapsed time. */
        if (particleSystem.born_particles < particleSystem.num_particles) {
            particleSystem.born_particles = Math.min(particleSystem.num_particles,
                Math.floor(particleSystem.born_particles + particleSystem.birth_rate * time_delta));
        }
        /* Set the previous update timestamp for calculating time delta in the
         *      next frame. */
        particleSystem.old_timestamp = timestamp_millis;

        gl.useProgram(particleSystem.particle_update_program);

        /* Most of the following is trivial setting of uniforms */
        gl.uniform1f(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_TimeDelta"),
            time_delta / 1000.0);
        gl.uniform1f(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_Time"),
            particleSystem.total_time / 1000.0);
        gl.uniform1f(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_TotalTime"),
            particleSystem.total_time);
        gl.uniform2f(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_Gravity"),
            particleSystem.gravity[0], particleSystem.gravity[1]);

        // PARTICLE SYSTEM SPECIFIC UNIFORMS --------------------------------------
        gl.uniform2f(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_Origin"),
            particleSystem.origin[0],
            particleSystem.origin[1]);
        gl.uniform1f(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_MinTheta"),
            particleSystem.min_theta);
        gl.uniform1f(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_MaxTheta"),
            particleSystem.max_theta);
        gl.uniform1f(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_MinSpeed"),
            particleSystem.min_speed);
        gl.uniform1f(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_MaxSpeed"),
            particleSystem.max_speed);
        // ------------------------------------------------------------------------

        particleSystem.total_time += time_delta;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, particleSystem.rg_noise);
        gl.uniform1i(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_RgNoise"),
            0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, particleSystem.force_field);
        gl.uniform1i(
            gl.getUniformLocation(particleSystem.particle_update_program, "u_ForceField"),
            1);


        /* Bind the "read" buffer - it contains the particleSystem of the particle system
         *     "as of now".*/
        gl.bindVertexArray(particleSystem.particle_sys_vaos[particleSystem.read]);

        /* Bind the "write" buffer as transform feedback - the varyings of the
         *      update shader will be written here. */
        gl.bindBufferBase(
            gl.TRANSFORM_FEEDBACK_BUFFER, 0, particleSystem.particle_sys_buffers[particleSystem.write]);

        /* Since we're not actually rendering anything when updating the particle
         *      particleSystem, disable rasterization.*/
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
        gl.bindVertexArray(particleSystem.particle_sys_vaos[particleSystem.read + 2]);
        gl.useProgram(particleSystem.particle_render_program);
        gl.drawArrays(gl.POINTS, 0, num_part);

        /* Finally, we swap read and write buffers. The updated particleSystem will be
         *      rendered on the next frame. */
        var tmp = particleSystem.read;
        particleSystem.read = particleSystem.write;
        particleSystem.write = tmp;
    }
}

function initUserSocket(UID){
    if(UID === ''){
        throw 'User ID Error!';
    } else {
        socket = socketIOClient('ws://localhost:8989', {
            query : 'uid='+UID
        });
        // socket.on('particleSystem', ps => particleSystems.push(ps));
        // socket.on('particleSystem', ps => console.log(ps));
    }
}

function generateParticleSystem(gl, force_field_image){
    return init(
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
    );
}
