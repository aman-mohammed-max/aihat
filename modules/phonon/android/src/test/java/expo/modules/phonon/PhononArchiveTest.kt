package expo.modules.phonon

import com.github.luben.zstd.ZstdOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest

class PhononArchiveTest {
  @Test
  fun coalescesExtractionProgressToAboutOneHundredEvents() {
    val total = 16L * 1024 * 1024
    val throttle = ProgressThrottle(total)
    var reports = 0
    var lastReport = 0L

    var written = 64L * 1024
    while (written <= total) {
      if (throttle.shouldReport(written)) {
        reports++
        lastReport = written
      }
      written += 64L * 1024
    }

    assertTrue(reports <= 100)
    assertTrue(lastReport == total)
  }

  @Test
  fun extractsAndPromotesVerifiedFiles() {
    withTempDir { root ->
      val archive = archive(root, entries())
      val destination = File(root, "phonon/Phonon-2")
      PhononModule().unpackForTest(archive, destination)

      assertArrayEquals(byteArrayOf(1, 2, 3, 4), File(destination, "model.fermion").readBytes())
      assertTrue(File(destination, "config.json").isFile)
      assertFalse(archive.exists())
      assertFalse(File(root, "phonon/Phonon-2.installing").exists())
    }
  }

  @Test
  fun acceptsSafeDotPrefixedTarEntries() {
    withTempDir { root ->
      val archive = archive(root, entries().map { it.copy(name = "./${it.name}") })
      val destination = File(root, "phonon/Phonon-2")

      PhononModule().unpackForTest(archive, destination)

      assertTrue(File(destination, "model.fermion").isFile)
    }
  }

  @Test
  fun refusesBadDigestAndKeepsPreviousInstallAndArchive() {
    withTempDir { root ->
      val destination = File(root, "phonon/Phonon-2").apply { mkdirs() }
      File(destination, "keep.txt").writeText("previous")
      val archive = archive(root, entries(badDigest = true))

      expectFailure { PhononModule().unpackForTest(archive, destination) }

      assertTrue(archive.exists())
      assertTrue(File(destination, "keep.txt").readText() == "previous")
      assertFalse(File(destination, "model.fermion").exists())
      assertFalse(File(destination.parentFile, "Phonon-2.installing").exists())
    }
  }

  @Test
  fun replacesPreviousInstallOnlyAfterNewArchiveIsVerified() {
    withTempDir { root ->
      val destination = File(root, "phonon/Phonon-2").apply { mkdirs() }
      File(destination, "old-model").writeText("previous")
      val archive = archive(root, entries())

      PhononModule().unpackForTest(archive, destination)

      assertTrue(File(destination, "model.fermion").readBytes().contentEquals(byteArrayOf(1, 2, 3, 4)))
      assertFalse(File(destination, "old-model").exists())
      assertFalse(File(destination.parentFile, "Phonon-2.previous").exists())
      assertFalse(archive.exists())
    }
  }

  @Test
  fun removesStaleStagingFilesWhenRetryingAfterAnInterruptedInstall() {
    withTempDir { root ->
      val destination = File(root, "phonon/Phonon-2")
      val staging = File(destination.parentFile, "${destination.name}.installing").apply { mkdirs() }
      File(staging, "model.fermion.part").writeText("partial model")
      val archive = archive(root, entries())

      PhononModule().unpackForTest(archive, destination)

      assertArrayEquals(byteArrayOf(1, 2, 3, 4), File(destination, "model.fermion").readBytes())
      assertFalse(staging.exists())
      assertFalse(archive.exists())
    }
  }

  @Test
  fun cancellationKeepsTheDownloadAndPreviousInstall() {
    withTempDir { root ->
      val destination = File(root, "phonon/Phonon-2").apply { mkdirs() }
      File(destination, "keep.txt").writeText("previous")
      val archive = archive(root, entries())
      val failure = try {
        PhononModule().unpack(archive, destination, generation = 1, emitProgress = false)
        throw AssertionError("Expected extraction cancellation")
      } catch (error: PhononException) {
        error
      }

      assertTrue(failure.message?.contains("cancelled") == true)
      assertTrue(archive.exists())
      assertTrue(File(destination, "keep.txt").readText() == "previous")
      assertFalse(File(destination.parentFile, "Phonon-2.installing").exists())
    }
  }

  @Test
  fun refusesInsufficientStorageAndKeepsTheDownloadAndPreviousInstall() {
    withTempDir { root ->
      val destination = File(root, "phonon/Phonon-2").apply { mkdirs() }
      File(destination, "keep.txt").writeText("previous")
      val archive = archive(root, entries())

      expectFailure { PhononModule().unpackForTest(archive, destination, availableSpace = 0) }

      assertTrue(archive.exists())
      assertTrue(File(destination, "keep.txt").readText() == "previous")
      assertFalse(File(destination, "model.fermion").exists())
      assertFalse(File(destination.parentFile, "Phonon-2.installing").exists())
    }
  }

  @Test
  fun rejectsDuplicateRequiredMembersAndKeepsPreviousInstall() {
    withTempDir { root ->
      val destination = File(root, "phonon/Phonon-2").apply { mkdirs() }
      File(destination, "keep.txt").writeText("previous")
      val archive = archive(root, entries() + entries().first { it.name == "config.json" })

      expectFailure { PhononModule().unpackForTest(archive, destination) }

      assertTrue(archive.exists())
      assertTrue(File(destination, "keep.txt").readText() == "previous")
      assertFalse(File(destination, "model.fermion").exists())
    }
  }

  @Test
  fun rejectsDamagedTarHeaderBeforeReadingMemberData() {
    withTempDir { root ->
      val archive = archive(root, entries(), corruptFirstHeader = true)
      val destination = File(root, "phonon/Phonon-2")

      expectFailure { PhononModule().unpackForTest(archive, destination) }

      assertTrue(archive.exists())
      assertFalse(destination.exists())
    }
  }

  @Test
  fun rejectsTraversalAndDoesNotWriteOutsideStaging() {
    withTempDir { root ->
      val archive = archive(root, listOf(TarEntry("../escape", byteArrayOf(9))))
      val destination = File(root, "phonon/Phonon-2")

      expectFailure { PhononModule().unpackForTest(archive, destination) }

      assertTrue(archive.exists())
      assertFalse(File(root.parentFile, "escape").exists())
      assertFalse(destination.exists())
    }
  }

  @Test
  fun rejectsSymbolicLinks() {
    withTempDir { root ->
      val archive = archive(root, listOf(TarEntry("model.fermion", "../../escape".toByteArray(), type = '2')))
      val destination = File(root, "phonon/Phonon-2")

      expectFailure { PhononModule().unpackForTest(archive, destination) }

      assertTrue(archive.exists())
      assertFalse(destination.exists())
    }
  }

  @Test
  fun refusesTruncatedArchiveAndKeepsDownloadedSource() {
    withTempDir { root ->
      val archive = archive(root, entries().dropLast(1))
      val destination = File(root, "phonon/Phonon-2")

      expectFailure { PhononModule().unpackForTest(archive, destination) }

      assertTrue(archive.exists())
      assertFalse(destination.exists())
    }
  }

  @Test
  fun extractsSyntheticLargeModel() {
    withTempDir { root ->
      val model = ByteArray(16 * 1024 * 1024) { (it % 251).toByte() }
      val config = "{\"labels\":[]}".toByteArray()
      val manifest = """{"files":[{"path":"config.json","original_sha256":"${sha256(config)}"},{"path":"model.fermion","original_sha256":"${sha256(model)}"}]}""".toByteArray()
      val archive = archive(root, listOf(TarEntry("bps_manifest.json", manifest), TarEntry("config.json", config), TarEntry("model.fermion", model)))
      val destination = File(root, "phonon/Phonon-2")

      PhononModule().unpackForTest(archive, destination)

      assertTrue(File(destination, "model.fermion").length() == model.size.toLong())
      assertTrue(File(destination, "model.fermion").readBytes().contentEquals(model))
    }
  }

  /** The CI runner supplies the pinned publisher archive; ordinary local unit runs stay offline. */
  @Test
  fun extractsPinnedPublisherArchiveWhenProvided() {
    val archivePath = System.getenv("PHONON_TEST_ARCHIVE")
    assumeTrue("PHONON_TEST_ARCHIVE is only set by the real-model CI job", !archivePath.isNullOrBlank())
    val archive = File(archivePath!!)
    assertTrue("The downloaded Phonon archive is missing", archive.isFile)
    assertTrue("The downloaded Phonon archive has the wrong size", archive.length() == 163_515_201L)
    assertTrue("The downloaded Phonon archive checksum changed", sha256(archive) == "98125795b6dda72f5c6eee9ba33d19815df65dcb18b50a357bf9f73c9935309e")

    withTempDir { root ->
      val destination = File(root, "phonon/Phonon-2")
      PhononModule().unpackForTest(archive, destination)

      assertTrue("The publisher model was not extracted", File(destination, "model.fermion").length() == 177_438_361L)
      assertTrue(File(destination, "config.json").isFile)
      assertTrue(File(destination, "bps_manifest.json").isFile)
      assertFalse("A successful install should consume the verified archive", archive.exists())
    }
  }

  @Test
  fun refusesEmptyArchive() {
    withTempDir { root ->
      val archive = archive(root, emptyList())
      val destination = File(root, "phonon/Phonon-2")

      expectFailure { PhononModule().unpackForTest(archive, destination) }

      assertTrue(archive.exists())
      assertFalse(destination.exists())
    }
  }

  @Test
  fun refusesCorruptZstdAndKeepsDownloadedSource() {
    withTempDir { root ->
      val archive = File(root, "model.tar.zst").apply { writeBytes(byteArrayOf(1, 2, 3, 4, 5)) }
      val destination = File(root, "phonon/Phonon-2")

      expectFailure { PhononModule().unpackForTest(archive, destination) }

      assertTrue(archive.exists())
      assertFalse(destination.exists())
      assertFalse(File(destination.parentFile, "Phonon-2.installing").exists())
    }
  }

  @Test
  fun rejectsOversizedManifestBeforeReadingItIntoMemory() {
    withTempDir { root ->
      val oversizedManifest = ByteArray((1 shl 20) + 1)
      val archive = archive(root, listOf(TarEntry("bps_manifest.json", oversizedManifest)))
      val destination = File(root, "phonon/Phonon-2")

      expectFailure { PhononModule().unpackForTest(archive, destination) }

      assertTrue(archive.exists())
      assertFalse(destination.exists())
      assertFalse(File(destination.parentFile, "Phonon-2.installing").exists())
    }
  }

  @Test
  fun refusesArchiveWithoutBothTarEndMarkers() {
    withTempDir { root ->
      val archive = archive(root, entries(), endMarkerBlocks = 1)
      val destination = File(root, "phonon/Phonon-2")

      expectFailure { PhononModule().unpackForTest(archive, destination) }

      assertTrue(archive.exists())
      assertFalse(destination.exists())
    }
  }

  private data class TarEntry(val name: String, val bytes: ByteArray, val type: Char = '0')

  private fun entries(badDigest: Boolean = false): List<TarEntry> {
    val config = "{\"labels\":[]}".toByteArray()
    val model = byteArrayOf(1, 2, 3, 4)
    val configHash = sha256(config)
    val modelHash = if (badDigest) "0".repeat(64) else sha256(model)
    val manifest = """{"files":[{"path":"config.json","original_sha256":"$configHash"},{"path":"model.fermion","original_sha256":"$modelHash"}]}""".toByteArray()
    return listOf(TarEntry("bps_manifest.json", manifest), TarEntry("config.json", config), TarEntry("model.fermion", model))
  }

  private fun archive(root: File, entries: List<TarEntry>, endMarkerBlocks: Int = 2, corruptFirstHeader: Boolean = false): File {
    val file = File(root, "model.tar.zst")
    ZstdOutputStream(FileOutputStream(file)).use { zstd ->
      for ((index, entry) in entries.withIndex()) {
        val header = ByteArray(512)
        entry.name.toByteArray().copyInto(header, 0, endIndex = minOf(entry.name.length, 100))
        octal(header, 100, 8, 0x1a4)
        octal(header, 108, 8, 0)
        octal(header, 116, 8, 0)
        octal(header, 124, 12, entry.bytes.size.toLong())
        octal(header, 136, 12, 0)
        for (i in 148..155) header[i] = ' '.code.toByte()
        header[156] = entry.type.code.toByte()
        "ustar\u0000".toByteArray().copyInto(header, 257)
        "00".toByteArray().copyInto(header, 263)
        val checksum = header.sumOf { it.toLong() and 0xff }.toString(8).padStart(6, '0')
        checksum.toByteArray().copyInto(header, 148)
        header[154] = 0
        header[155] = ' '.code.toByte()
        if (corruptFirstHeader && index == 0) header[0] = 'X'.code.toByte()
        zstd.write(header)
        zstd.write(entry.bytes)
        repeat((512 - entry.bytes.size % 512) % 512) { zstd.write(0) }
      }
      repeat(endMarkerBlocks) { zstd.write(ByteArray(512)) }
    }
    return file
  }

  private fun octal(header: ByteArray, offset: Int, length: Int, value: Long) {
    val s = value.toString(8).padStart(length - 1, '0')
    s.toByteArray().copyInto(header, offset)
    header[offset + length - 1] = 0
  }

  private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun expectFailure(block: () -> Unit) {
    try {
      block()
      throw AssertionError("Expected extraction to fail")
    } catch (_: PhononException) {
      // Expected validation failure.
    }
  }

  private inline fun withTempDir(block: (File) -> Unit) {
    val dir = createTempDir(prefix = "phonon-archive-test-")
    try { block(dir) } finally { dir.deleteRecursively() }
  }
}
