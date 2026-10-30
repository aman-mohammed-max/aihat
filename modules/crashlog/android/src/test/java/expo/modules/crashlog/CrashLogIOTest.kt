package expo.modules.crashlog

import java.io.Reader
import java.io.StringReader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CrashLogIOTest {
  @Test
  fun readTextStopsAtConfiguredLimit() {
    val text = "x".repeat(CrashLogIO.MAX_REPORT_CHARS + 100)

    val result = CrashLogIO.readText(StringReader(text), CrashLogIO.MAX_REPORT_CHARS)

    assertEquals(CrashLogIO.MAX_REPORT_CHARS, result.length)
  }

  @Test
  fun readBytesStopsAtConfiguredLimit() {
    val source = CountingReaderInputStream()

    val result = CrashLogIO.readBytes(source, CrashLogIO.MAX_TOMBSTONE_BYTES)

    assertEquals(CrashLogIO.MAX_TOMBSTONE_BYTES, result.size)
    assertEquals(CrashLogIO.MAX_TOMBSTONE_BYTES, source.bytesRead)
  }

  @Test
  fun stackTraceIsBounded() {
    val error = IllegalStateException("x".repeat(CrashLogIO.MAX_REPORT_CHARS * 2))

    val result = CrashLogIO.stackTrace(error)

    assertTrue(result.length <= CrashLogIO.MAX_REPORT_CHARS)
  }

  private class CountingReaderInputStream : java.io.InputStream() {
    var bytesRead = 0
      private set

    override fun read(): Int {
      bytesRead++
      return 'x'.code
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
      bytesRead += length
      buffer.fill('x'.code.toByte(), offset, offset + length)
      return length
    }
  }
}
