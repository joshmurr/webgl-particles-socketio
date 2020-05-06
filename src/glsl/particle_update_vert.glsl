#version 300 es
precision mediump float;

uniform float u_TimeDelta;
uniform sampler2D u_RgNoise;
uniform vec2 u_Gravity;
uniform vec2 u_Origin;
uniform float u_MinTheta;
uniform float u_MaxTheta;
uniform float u_MinSpeed;
uniform float u_MaxSpeed;
uniform sampler2D u_ForceField;

in vec2 i_Position;
in float i_Age;
in float i_Life;
in vec2 i_Velocity;

out vec2 v_Position;
out float v_Age;
out float v_Life;
out vec2 v_Velocity;

vec2 attractorLoc1 = vec2(-0.5,0.0);
vec2 attractorLoc2 = vec2(0.5,0.0);
vec2 acceleration = vec2(0.0,0.0);
float mass = 5000.0;

float random (vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233)))* 43758.5453123);
}

vec2 attract(vec2 attactor, vec2 loc){
    vec2 dir = attactor - loc;
    float d = length(dir);
    normalize(dir);
    float force = 500.0/(20.0*d*d);
    dir *= force;
    return dir;
}

void main(){
    if(i_Age >= i_Life) {
        // Sampling the texture based on particle ID.
        // This will return the same random seed value for each particle
        // every time.
        ivec2 noise_coord = ivec2(gl_VertexID % 512, gl_VertexID / 512);
        vec2 rand = texelFetch(u_RgNoise, noise_coord, 0).rg;
        // Initial direction of particle based on random value
        float theta = u_MinTheta + rand.r*(u_MaxTheta - u_MinTheta);

        float x = cos(theta);
        float y = sin(theta);

        // v_Position = u_Origin;
        v_Position = vec2((random(rand.xy)*2.0)-1.0, (random(rand.yx)*2.0)-1.0);

        v_Age = 0.0;
        v_Life = i_Life;

        v_Velocity = vec2(x, y) * (u_MinSpeed + rand.g * (u_MaxSpeed - u_MinSpeed));
    } else {
        v_Position = i_Position + i_Velocity * u_TimeDelta;
        acceleration += attract(attractorLoc1, v_Position);
        acceleration += attract(attractorLoc2, v_Position);
        acceleration /= mass;
        v_Age = i_Age + u_TimeDelta;
        v_Life = i_Life;
        // vec2 force = 4.0 * (2.0 * texture(u_ForceField, i_Position).rg - vec2(1.0));
        v_Velocity = i_Velocity + acceleration  + u_Gravity * u_TimeDelta;// + force * u_TimeDelta;
        acceleration *= 0.0;
    }
}
