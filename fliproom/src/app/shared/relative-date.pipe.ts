import { Pipe, PipeTransform } from '@angular/core';
import * as moment from 'moment';

@Pipe({
    name: 'relativeDate',
    pure: false
})
export class RelativeDatePipe implements PipeTransform {
    transform(value: string): string {
        return value ? moment(value).fromNow() : '';
    }
}
