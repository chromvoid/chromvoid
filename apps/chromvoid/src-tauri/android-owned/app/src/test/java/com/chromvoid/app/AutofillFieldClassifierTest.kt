package com.chromvoid.app

import android.text.InputType
import android.view.View
import com.chromvoid.app.autofill.AutofillFieldClassifier
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AutofillFieldClassifierTest {
    @Test
    fun looksLikeTextInput_rejectsFirefoxChromeBars() {
        assertFalse(
            AutofillFieldClassifier.looksLikeTextInput(
                className = "android.view.ViewGroup",
                autofillType = View.AUTOFILL_TYPE_NONE,
                inputType = 0,
                htmlTag = null,
                htmlType = null,
            ),
        )
    }

    @Test
    fun looksLikeTextInput_rejectsSubmitInputs() {
        assertFalse(
            AutofillFieldClassifier.looksLikeTextInput(
                className = "android.widget.EditText",
                autofillType = View.AUTOFILL_TYPE_TEXT,
                inputType = InputType.TYPE_CLASS_TEXT,
                htmlTag = "input",
                htmlType = "submit",
            ),
        )
    }

    @Test
    fun looksLikeTextInput_acceptsOtpInputs() {
        assertTrue(
            AutofillFieldClassifier.looksLikeTextInput(
                className = "android.widget.EditText",
                autofillType = View.AUTOFILL_TYPE_TEXT,
                inputType = InputType.TYPE_CLASS_NUMBER,
                htmlTag = "input",
                htmlType = "text",
            ),
        )
    }
}
