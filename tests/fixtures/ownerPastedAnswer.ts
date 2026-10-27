/**
 * Test fixture capturing the owner's exact pasted answer pattern
 * when asking the AI to construct Ceva's theorem in Geometry.
 */
export const OWNER_PASTED_CEVA_ANSWER = `* Domain: Geometry / 2D Euclidean geometry
* User wants to construct Ceva's theorem in Geometry.
* We will use run_commands to create points and lines.
</physlab_action>

Let's construct it live!
Ceva's Theorem states that given a triangle ABC and points D, E, F on lines BC, CA, AB respectively, the lines AD, BE, CF are concurrent if and only if:
$$\\frac{BD}{DC} \\cdot \\frac{CE}{EA} \\cdot \\frac{AF}{FB} = 1$$`

export const OWNER_PASTED_ANSWER_WITH_HALF_STREAM = `* Domain: Geometry
* User wants to construct Ceva's theorem.
* We will use run_commands to draw triangle ABC.
</physlab_action>
Here is the theorem:
$$\\frac{AF}{FB} \\cdot \\frac{BD}{DC} \\cdot \\frac{CE}{EA} = 1$$
</physlab_act`
