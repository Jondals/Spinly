/**
 * EqualizerBars: a tiny animated equalizer used as a "music is playing" indicator.
 */

/** Three bars that go up and down while music is playing (animated in CSS). */
function EqualizerBars() {
    return (
        <span className="spinly-eq" aria-hidden="true">
            <span />
            <span />
            <span />
        </span>
    );
}

export default EqualizerBars;
