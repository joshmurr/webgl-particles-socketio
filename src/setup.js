export function createCanvas(width, height) {
    let canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    let body = document.getElementsByTagName("body")[0];
    body.appendChild(canvas);
    const gl = canvas.getContext('webgl2');

    return [canvas, gl];
}

export function createOverlay(){
    const container = document.createElement('div');
    container.classList.add("overlay");

    const text = document.createElement('P');
    text.innerHTML = `<h2>Getting to Know WebGL</h2>
                      <br>Generating icospheres and disturbing the vertices with Perlin noise.
                      <br><br>Mouse + WASD - Move
                      <br>Scroll - Change FOV`;
    container.appendChild(text);

    const code = document.createElement('a');
    code.text = "Code";
    code.href = "https://github.com/joshmurr/webgl_environment_test";

    container.appendChild(code);

    const body = document.getElementsByTagName("body")[0];
    body.appendChild(container);
}

export function initShaderProgram(gl, vsSource, fsSource, transformFeedbackVaryings) {
    const shaderProgram = gl.createProgram();
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);

    /* Specify varyings that we want to be captured in the transform
     *      feedback buffer. */
    if (transformFeedbackVaryings != null) {
        gl.transformFeedbackVaryings(
            shaderProgram,
            transformFeedbackVaryings,
            gl.INTERLEAVED_ATTRIBS)
    }

    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }

    return shaderProgram;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

export function randomRGData(size_x, size_y){
    let d = [];
    for(let i=0; i<size_x*size_y; ++i){
        d.push(Math.random()*255.0);
        d.push(Math.random()*255.0);
    }
    return new Uint8Array(d);
}

export function initialParticleData(num_parts, min_age, max_age){
    var data = [];
    for(let i=0; i<num_parts; ++i){
        // Position
        // data.push(0.0, 0.0);
        data.push(Math.random(), Math.random());

        // Life
        let life = min_age + Math.random() * (max_age - min_age);
        data.push(life+1, life);

        // Velocity
        data.push(0.0, 0.0);
    }
    return data;
}

export function setupParticleBufferVAO(gl, buffers, vao){
    gl.bindVertexArray(vao);
    for(let i=0; i<buffers.length; i++){
        const buffer = buffers[i];
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer_object);

        let offset = 0;

        for(const attrib_name in buffer.attribs){
            if(buffer.attribs.hasOwnProperty(attrib_name)){
                const attrib_desc = buffer.attribs[attrib_name];
                gl.enableVertexAttribArray(attrib_desc.location);
                gl.vertexAttribPointer(
                    attrib_desc.location,
                    attrib_desc.num_components,
                    attrib_desc.type,
                    false,
                    buffer.stride,
                    offset);

                const type_size = 4;
                offset += attrib_desc.num_components * type_size;
                if(attrib_desc.hasOwnProperty("divisor")){
                    gl.vertexAttribDivisor(attrib_desc.location, attrib_desc.divisor);
                }
            }
        }
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

export function initWorld(gl, force_field_image, gravity){
    /* Create a texture for random values. */
    const rg_noise_texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rg_noise_texture);
    gl.texImage2D(gl.TEXTURE_2D,
        0,
        gl.RG8,
        512, 512,
        0,
        gl.RG,
        gl.UNSIGNED_BYTE,
        randomRGData(512, 512));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const force_field_texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, force_field_texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, force_field_image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return {
        gravity: gravity,
        rg_noise: rg_noise_texture,
        force_field: force_field_texture,
    };
}

export function init(gl, programOne, programTwo, num_particles, particle_birth_rate, min_age, max_age,
    min_theta, max_theta, min_speed, max_speed){
    if(max_age < min_age) throw "Invalid age range";
    if (max_theta < min_theta || min_theta < -Math.PI || max_theta > Math.PI) throw "Invalid theta range.";

    const update_program = initShaderProgram(gl, programOne[0], programOne[1],
        [
            "v_Position",
            "v_Age",
            "v_Life",
            "v_Velocity",
        ]);
    const render_program = initShaderProgram(gl, programTwo[0], programTwo[1], null);


    const update_attrib_locations = {
        i_Position: {
            location: gl.getAttribLocation(update_program, "i_Position"),
            num_components: 2,
            type: gl.FLOAT
        },
        i_Age: {
            location: gl.getAttribLocation(update_program, "i_Age"),
            num_components: 1,
            type: gl.FLOAT
        },
        i_Life: {
            location: gl.getAttribLocation(update_program, "i_Life"),
            num_components: 1,
            type: gl.FLOAT
        },
        i_Velocity: {
            location: gl.getAttribLocation(update_program, "i_Velocity"),
            num_components: 2,
            type: gl.FLOAT
        }
    };
    const render_attrib_locations = {
        i_Position: {
            location: gl.getAttribLocation(render_program, "i_Position"),
            num_components: 2,
            type: gl.FLOAT
        },
        i_Age: {
            location: gl.getAttribLocation(update_program, "i_Age"),
            num_components: 1,
            type: gl.FLOAT
        },
        i_Life: {
            location: gl.getAttribLocation(update_program, "i_Life"),
            num_components: 1,
            type: gl.FLOAT
        },
    };

    /* These buffers shall contain data about particles. */
    const buffers = [
        gl.createBuffer(),
        gl.createBuffer(),
    ];
    /* We'll have 4 VAOs... */
    const vaos = [
        gl.createVertexArray(), /* for updating buffer 1 */
        gl.createVertexArray(), /* for updating buffer 2 */
        gl.createVertexArray(), /* for rendering buffer 1 */
        gl.createVertexArray() /* for rendering buffer 2 */
    ];

    const vao_desc = [
        {
            vao: vaos[0],
            buffers: [{
                buffer_object: buffers[0],
                stride: 4 * 6,
                attribs: update_attrib_locations
            }]
        },
        {
            vao: vaos[1],
            buffers: [{
                buffer_object: buffers[1],
                stride: 4 * 6,
                attribs: update_attrib_locations
            }]
        },
        {
            vao: vaos[2],
            buffers: [{
                buffer_object: buffers[0],
                stride: 4 * 6,
                attribs: render_attrib_locations
            }],
        },
        {
            vao: vaos[3],
            buffers: [{
                buffer_object: buffers[1],
                stride: 4 * 6,
                attribs: render_attrib_locations
            }],
        },
    ];
    const initial_data = new Float32Array(initialParticleData(num_particles, min_age, max_age));
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[0]);
    gl.bufferData(gl.ARRAY_BUFFER, initial_data, gl.STREAM_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[1]);
    gl.bufferData(gl.ARRAY_BUFFER, initial_data, gl.STREAM_DRAW);

    /* Set up VAOs */
    for (let i = 0; i < vao_desc.length; i++) {
        setupParticleBufferVAO(gl, vao_desc[i].buffers, vao_desc[i].vao);
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);



    /* Set up blending */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return {
        particle_sys_buffers: buffers,
        particle_sys_vaos: vaos,
        read: 0,
        write: 1,
        particle_update_program: update_program,
        particle_render_program: render_program,
        num_particles: initial_data.length / 6,
        old_timestamp: 0.0,
        total_time: 0.0,
        born_particles: 0,
        birth_rate: particle_birth_rate,
        origin: [0.0, 0.0],
        min_theta: min_theta,
        max_theta: max_theta,
        min_speed: min_speed,
        max_speed: max_speed,
    };

}
