# Experiment with WebGL Particles Systems and Socket.io

The core particle system calculations are performed on the GPU. There is a calculations buffer and a render buffer which are continually updated using _transform feedback varyings_ and swapped. It is a pretty direct implementation of [this tutorial] with some minor changes so go there for more information.

To see the project (and see other people on the project, if there are any) [__see it on Glitch here__](https://joshmurr-webgl-particles-socketio.glitch.me/).
