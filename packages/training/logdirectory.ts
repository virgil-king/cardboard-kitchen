import * as fs from "fs";

/**
 * Manages a directory of files or directories with a maximum total size.
 *
 * Only one instance should be used to write to a given directory at the
 * same time or inconsistent behavior may result.
 */
export class LogDirectory {
  sizeBytes = 0;
  filenameToSizeBytes = new Map<string, number>();
  newestFilenameDate: Date | undefined = undefined;
  constructor(readonly path: string, readonly maxSizeBytes: number) {
    fs.mkdirSync(path, { recursive: true });
    // Lexical sorting sorts the ISO string filenames by time
    const filenames = fs.readdirSync(path).sort();
    var maxDate: Date | undefined = undefined;
    for (const filename of filenames) {
      const size = this.size(`${path}/${filename}`);
      this.sizeBytes += size;
      this.filenameToSizeBytes.set(filename, size);
      const date = new Date(filename);
      if (maxDate == undefined || date.getTime() > maxDate.getTime()) {
        maxDate = date;
      }
    }
    if (maxDate != undefined) {
      this.newestFilenameDate = maxDate;
    }
    this.enforceMaxSize();
  }

  enforceMaxSize() {
    if (this.sizeBytes < this.maxSizeBytes) {
      return;
    }
    // Oldest filenames at the end
    const sortedFilenames = [...this.filenameToSizeBytes.keys()]
      .sort()
      .reverse();
    while (this.sizeBytes > this.maxSizeBytes) {
      const filename = sortedFilenames.pop();
      if (filename == undefined) {
        throw new Error(
          "Bug: size was greater than max but no files to delete"
        );
      }
      const sizeBytes = this.filenameToSizeBytes.get(filename);
      if (sizeBytes == undefined) {
        throw new Error(`Bug: unknown file ${filename}`);
      }
      const path = `${this.path}/${filename}`;
      console.log(`Deleting ${path}`);
      fs.rmSync(path, { recursive: true });
      this.filenameToSizeBytes.delete(filename);
      this.sizeBytes -= sizeBytes;
    }
  }

  /**
   * Returns the total size of the files contained in {@link path}, which
   * may point to a directory or file and may or may not point to a child
   * of the managed directory.
   */
  size(path: string): number {
    const stat = fs.statSync(path);
    if (stat.isFile()) {
      return stat.size;
    } else {
      const filenames = fs.readdirSync(path);
      const childSizes = filenames.map((filename) =>
        this.size(`${path}/${filename}`)
      );
      return childSizes.reduce((reduction, next) => reduction + next, 0);
    }
  }

  /**
   * Writes {@link data} into a new file
   */
  writeData(data: Uint8Array) {
    var filenameDate = new Date();
    if (
      this.newestFilenameDate != undefined &&
      filenameDate.getTime() <= this.newestFilenameDate.getTime()
    ) {
      // Shift new filenames forward to guarantee uniqueness
      filenameDate.setTime(this.newestFilenameDate.getTime() + 1);
    }
    this.newestFilenameDate = filenameDate;
    const filenameString = filenameDate.toISOString();
    const path = `${this.path}/${filenameString}`;
    console.log(`Writing ${path}`);

    fs.writeFileSync(path, data);

    this.filenameToSizeBytes.set(filenameString, data.length);
    this.sizeBytes += data.length;
    this.enforceMaxSize();
  }

  /**
   * Invokes {@link writer} with a path to which to write a new
   * file or directory hierarchy
   */
  async write(writer: (path: string) => Promise<void>): Promise<void> {
    var filenameDate = new Date();
    if (
      this.newestFilenameDate != undefined &&
      filenameDate.getTime() <= this.newestFilenameDate.getTime()
    ) {
      // Shift new filenames forward to guarantee uniqueness
      filenameDate.setTime(this.newestFilenameDate.getTime() + 1);
    }
    this.newestFilenameDate = filenameDate;
    const filenameString = filenameDate.toISOString();
    const path = `${this.path}/${filenameString}`;
    console.log(`Writing ${path}`);

    await writer(path);

    const size = this.size(path);
    this.filenameToSizeBytes.set(filenameString, size);
    this.sizeBytes += size;
    this.enforceMaxSize();
  }
}
